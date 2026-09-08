const marketData = require('../data/sowetoMarketData');

/**
 * Public, read-only reference data: sourced Soweto rent bands, the suburb
 * list, and the tenant/landlord rights that already apply under the Rental
 * Housing Act 50 of 1999.
 *
 * No authentication: this is public information and the Android app reads it
 * on first load so the safety guide works offline after one fetch.
 */
class MarketInfoController {
  getMarketInfo(req, res) {
    res.set('Cache-Control', 'public, max-age=3600');
    return res.json({
      success: true,
      message: 'Soweto rental reference data retrieved successfully',
      data: {
        capturedOn: marketData.capturedOn,
        rentBands: marketData.rentBands,
        suburbs: marketData.suburbs,
        zonedSuburbs: marketData.zonedSuburbs,
        tenantRights: marketData.tenantRights,
        lawSourceUrl: marketData.lawSourceUrl,
        rentalHousingTribunal: marketData.rentalHousingTribunal,
        disclaimer:
          'Rent figures are asking prices collected from public listing portals on the date shown, not verified averages or an offer. Legal points summarise the Rental Housing Act 50 of 1999 and are not legal advice.'
      }
    });
  }
}

module.exports = new MarketInfoController();
