const roomRequestRepository = require('../repositories/RoomRequestRepository');
const fallbackStore = require('../../../services/fallbackStore');

class RoomRequestService {
  /**
   * Search and filter room seeker requests
   */
  async getRoomRequests(queryParams = {}) {
    try {
      const {
        suburb,
        roomType,
        maxBudget,
        keyword,
        status = 'active',
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        order = 'desc'
      } = queryParams;

      const filter = {};

      if (status && status !== 'all') {
        filter.status = status;
      }

      if (suburb && suburb !== 'all') {
        filter.suburb = new RegExp(`^${suburb}$`, 'i');
      }

      if (roomType && roomType !== 'all' && roomType !== 'Any') {
        filter.roomType = roomType;
      }

      if (maxBudget) {
        filter.maxBudget = { $lte: Number(maxBudget) };
      }

      if (keyword) {
        filter.$or = [
          { seekerName: new RegExp(keyword, 'i') },
          { suburb: new RegExp(keyword, 'i') },
          { notes: new RegExp(keyword, 'i') },
          { occupation: new RegExp(keyword, 'i') }
        ];
      }

      const skip = (Math.max(1, Number(page)) - 1) * Math.min(100, Number(limit));
      const sortOrder = order === 'asc' ? 1 : -1;
      const pagination = {
        skip,
        limit: Math.min(100, Number(limit)),
        sort: { [sortBy]: sortOrder }
      };

      const { items, total } = await roomRequestRepository.findPaginated(filter, pagination);

      // Same reasoning as ListingService.getListings: an empty result from a
      // working database is a real answer. Substituting the demo requests here
      // put invented tenants with real looking phone numbers in front of
      // landlords, and hid the fact that nobody had actually posted yet. The
      // fallback stays in the catch below, for when the database is unreachable.

      return { items, total, page: Number(page), limit: Number(limit) };
    } catch (err) {
      console.warn('RoomRequestService query fallback:', err.message);
      return {
        items: fallbackStore.fallbackRequests || [],
        total: (fallbackStore.fallbackRequests || []).length,
        page: 1,
        limit: 20
      };
    }
  }

  /**
   * Create a new room request
   */
  async createRoomRequest(data) {
    const formattedPhone = data.phone.startsWith('+') ? data.phone : (data.phone.startsWith('0') ? '+27' + data.phone.substring(1) : '+27' + data.phone);

    try {
      const request = await roomRequestRepository.create({
        seekerName: data.seekerName.trim(),
        phone: formattedPhone,
        hasWhatsapp: data.hasWhatsapp !== undefined ? Boolean(data.hasWhatsapp) : true,
        suburb: data.suburb.trim(),
        maxBudget: Number(data.maxBudget),
        roomType: data.roomType || 'Any',
        occupation: data.occupation || 'Single Person',
        moveInDate: data.moveInDate || 'Immediate',
        notes: (data.notes || '').trim(),
        amenitiesWanted: Array.isArray(data.amenitiesWanted) ? data.amenitiesWanted : [],
        status: 'active',
        isVerified: true
      });

      return request;
    } catch (err) {
      console.warn('RoomRequestService create fallback:', err.message);
      if (fallbackStore && fallbackStore.addRequest) {
        const fbReq = fallbackStore.addRequest({
          seekerName: data.seekerName.trim(),
          phone: formattedPhone,
          hasWhatsapp: data.hasWhatsapp !== undefined ? Boolean(data.hasWhatsapp) : true,
          suburb: data.suburb.trim(),
          maxBudget: Number(data.maxBudget),
          roomType: data.roomType || 'Any',
          occupation: data.occupation || 'Single Person',
          moveInDate: data.moveInDate || 'Immediate',
          notes: (data.notes || '').trim(),
          amenitiesWanted: Array.isArray(data.amenitiesWanted) ? data.amenitiesWanted : [],
          status: 'active',
          isVerified: true
        });
        return fbReq;
      }
      throw err;
    }
  }

  /**
   * Get single room request by ID
   */
  async getRequestById(id) {
    let req = null;
    try {
      req = await roomRequestRepository.findById(id);
    } catch (_) {}
    if (!req && fallbackStore && fallbackStore.fallbackRequests) {
      req = fallbackStore.fallbackRequests.find(r => String(r._id) === String(id));
    }
    return req;
  }

  /**
   * Mark request as found or archived
   */
  async updateStatus(id, status) {
    try {
      const updated = await roomRequestRepository.updateById(id, { status });
      if (updated) return updated;
    } catch (_) {}
    if (fallbackStore && fallbackStore.fallbackRequests) {
      const item = fallbackStore.fallbackRequests.find(r => String(r._id) === String(id));
      if (item) {
        item.status = status;
        return item;
      }
    }
    return null;
  }

  /**
   * Increment contact count
   */
  async trackContact(id) {
    try {
      const updated = await roomRequestRepository.incrementContactCount(id);
      if (updated) return updated;
    } catch (_) {}
    if (fallbackStore && fallbackStore.fallbackRequests) {
      const item = fallbackStore.fallbackRequests.find(r => String(r._id) === String(id));
      if (item) {
        item.contactCount = (item.contactCount || 0) + 1;
        return item;
      }
    }
    return null;
  }
}


module.exports = new RoomRequestService();
