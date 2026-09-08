const { GoogleGenAI } = require('@google/genai');
const config = require('../config');
const listingRepository = require('../repositories/ListingRepository');
const fallbackStore = require('../../../services/fallbackStore');
const marketData = require('../data/sowetoMarketData');

class AiAdvisorService {
  constructor() {
    this.ai = null;
    if (config.gemini.apiKey || process.env.GEMINI_API_KEY) {
      try {
        this.ai = new GoogleGenAI({ apiKey: config.gemini.apiKey || process.env.GEMINI_API_KEY });
      } catch (e) {
        console.warn('Gemini AI initialization notice:', e.message);
      }
    }
  }

  /**
   * Process Housing Advisor query with Soweto rental market context
   */
  async getAdvice(userQuery) {
    if (!userQuery || typeof userQuery !== 'string') {
      throw new Error('Query string is required.');
    }

    // Retrieve active listings for real context
    let listings = [];
    try {
      listings = await listingRepository.find({ status: 'active' }, 'title suburb monthlyRent propertyType amenities', { limit: 12 });
    } catch (e) {
      listings = fallbackStore.fallbackListings || [];
    }

    const listingSummaries = listings.map(l => 
      `- ${l.title} in ${l.suburb} (R${l.monthlyRent}/mo, ${l.propertyType}, Amenities: ${l.amenities ? l.amenities.join(', ') : 'None'})`
    ).join('\n');

    const systemPrompt = `You are the Soweto Township Housing & Rental Market Advisor on the "Rent A Room Soweto" platform.
You assist room seekers, students, and township tenants finding safe, affordable rooms, backrooms, flatlets, garage conversions, and student accommodation across Soweto (including Dobsonville, Orlando West, Orlando East, Pimville, Diepkloof, Protea Glen, Meadowlands, Dube, Jabavu, Jabulani, Moletsane, Zola, etc.).

Current verified listings available right now in Soweto:
${listingSummaries}

${marketData.buildMarketFactsPrompt()}

Standard safety rule: never pay a deposit before physically viewing the room and meeting the landlord.

Answer user questions helpfully, politely, and accurately with practical South African context (ZAR pricing, transport options like Rea Vaya, Metrorail, taxis, safety tips). Keep answers concise, clear, and easy to read.`;

    if (this.ai) {
      try {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('AI generation timeout')), 3000));
        const aiPromise = this.ai.models.generateContent({
          model: 'gemini-3.7-flash',
          contents: `${systemPrompt}\n\nUser Question: ${userQuery}`
        });

        const response = await Promise.race([aiPromise, timeoutPromise]);

        return {
          answer: response.text,
          model: 'gemini-3.7-flash',
          grounded: true
        };
      } catch (err) {
        console.warn('Gemini API call notice, using contextual advisor fallback:', err.message);
      }
    }

    // Contextual local rule-based fallback if API key is not present or offline
    const q = userQuery.toLowerCase();
    let answer = '';

    const roomBand = marketData.rentBands.find(b => b.key === 'single_room');
    const flatletBand = marketData.rentBands.find(b => b.key === 'bachelor_flatlet');
    const priceLine = `Asking rents on public listing sites, checked ${marketData.capturedOn}: single rooms and backrooms **R${roomBand.minRent} to R${roomBand.maxRent}/mo**, bachelor rooms and flatlets **R${flatletBand.minRent} to R${flatletBand.maxRent}/mo**. These are advertised prices, not a verified average, so treat them as a guide when you negotiate.`;

    if (q.includes('uj') || q.includes('student') || q.includes('campus')) {
      answer = `The University of Johannesburg Soweto Campus sits in **Doornkop/Soweto**, with **Pimville**, **Orlando East** and **Dobsonville** all within reach on Rea Vaya and taxi routes.\n\n${priceLine}\n\nUse the suburb filter above to see what is actually listed right now, and confirm in person before paying anything.`;
    } else if (q.includes('deposit') || q.includes('scam') || q.includes('safe') || q.includes('warning') || q.includes('right')) {
      const rights = marketData.tenantRights
        .slice(0, 4)
        .map(r => `- **${r.title}** (Rental Housing Act 50 of 1999, ${r.section}): ${r.detail}`)
        .join('\n');
      answer = `These are not tips, they are your rights in law:\n\n${rights}\n\nIf a landlord will not comply, the **${marketData.rentalHousingTribunal.province} Rental Housing Tribunal** hears the dispute **free of charge** (${marketData.rentalHousingTribunal.address}, ${marketData.rentalHousingTribunal.phone}).\n\nAnd the rule that stops most scams: never pay a deposit, a "holding fee" or a "viewing fee" before you have physically seen the room.`;
    } else if (q.includes('price') || q.includes('rent') || q.includes('cost') || q.includes('afford')
      || marketData.suburbs.some(sub => q.includes(sub.toLowerCase()))) {
      const bands = marketData.rentBands
        .map(b => `- **${b.label}**: R${b.minRent} to R${b.maxRent}/mo. ${b.note} _(${b.source}, checked ${b.capturedOn})_`)
        .join('\n');
      answer = `Advertised monthly rents across Soweto:\n\n${bands}\n\nPrices vary a lot inside a single suburb depending on whether the room has its own prepaid meter, its own bathroom and a secured yard, so compare on those three things rather than on the suburb name alone.`;
    } else {
      answer = `Welcome to the Soweto Housing Advisor.\n\n${priceLine}\n\nYou can filter by suburb and budget above. Before you pay anything, open the Safety & Rights guide: your deposit must sit in an interest-bearing account and come back to you within 7 days of the lease ending, and the Rental Housing Tribunal enforces that for free.`;
    }

    return {
      // 'grounded' used to be hardcoded true here even though this branch is a
      // canned answer, not a model reading live listings. It now reports what
      // it actually is: sourced reference data, no live listing lookup.
      answer,
      model: 'contextual_advisor',
      grounded: false,
      sourcedFrom: 'sowetoMarketData',
      dataCapturedOn: marketData.capturedOn
    };
  }
}

module.exports = new AiAdvisorService();
