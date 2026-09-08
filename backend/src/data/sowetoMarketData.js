/**
 * Real, sourced reference data for the Soweto rental market.
 *
 * Everything in this file is public information with a citable source and a
 * capture date. Nothing here is invented, and nothing here is a person's
 * private contact detail.
 *
 * WHY THIS FILE EXISTS
 * The AI advisor used to quote confident rand figures that nobody had checked
 * against a source. A tenant in Meadowlands reading "ensuite backrooms are
 * R2,000 to R2,800" has no way to know whether that came from the market or
 * from thin air. Numbers that shape what someone pays need a source and a
 * date, so that when they go stale it is obvious.
 *
 * TO REFRESH: re-check each source URL, update the figures and set
 * capturedOn to the date you checked. Do not edit a figure without moving
 * its date.
 */

const CAPTURED_ON = '2026-09-08';

/**
 * Monthly asking rents observed on public South African listing portals.
 * These are ASKING prices from live listings, not a statistical average of
 * signed leases. Presented as ranges, never as a single "market price".
 */
const rentBands = [
  {
    key: 'single_room',
    label: 'Single room / backroom',
    minRent: 1300,
    maxRent: 3000,
    note: 'Room in a private yard, usually sharing the main house bathroom or an outside toilet.',
    source: 'Roomies.co.za, Soweto rooms',
    sourceUrl: 'https://www.roomies.co.za/rooms/soweto-johannesburg-gauteng',
    capturedOn: CAPTURED_ON
  },
  {
    key: 'bachelor_flatlet',
    label: 'Bachelor room or flatlet',
    minRent: 1500,
    maxRent: 4500,
    note: 'Self-contained unit, own entrance, often own prepaid meter.',
    source: 'RoomKing, Soweto rooms to rent',
    sourceUrl: 'https://roomking.com/za/rooms-to-rent/gauteng/johannesburg/soweto',
    capturedOn: CAPTURED_ON
  },
  {
    key: 'apartment',
    label: 'Flat or apartment (1 to 3 bedroom)',
    minRent: 2000,
    maxRent: 8900,
    note: 'Lowest figures were 1 bedroom units in Protea Glen and Pimville Zone 6; highest was a 3 bedroom in Diepkloof.',
    source: 'Property24, apartments to rent in Soweto',
    sourceUrl: 'https://www.property24.com/apartments-to-rent/soweto/gauteng/102',
    capturedOn: CAPTURED_ON
  }
];

/**
 * Soweto suburbs and zones that actually appear in live rental listings.
 * Used for the search filter and for validating what a landlord types in,
 * so "Dobsonvile" and "dobsonville ext 2" both resolve to Dobsonville.
 */
const suburbs = [
  'Braamfischerville', 'Chiawelo', 'Diepkloof', 'Dlamini', 'Dobsonville',
  'Dube', 'Emdeni', 'Jabavu', 'Jabulani', 'Klipspruit', 'Mapetla',
  'Meadowlands', 'Mofolo', 'Moletsane', 'Molapo', 'Naledi', 'Orlando East',
  'Orlando West', 'Phiri', 'Pimville', 'Protea Glen', 'Protea North',
  'Senaoane', 'Thulani', 'Tladi', 'Zola', 'Zondi'
];

/**
 * Areas that are commonly numbered by zone, so the UI can offer the zone
 * picker only where zones actually exist.
 */
const zonedSuburbs = {
  Diepkloof: [1, 2, 3, 4, 5, 6],
  Meadowlands: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  Pimville: [1, 2, 3, 4, 5, 6, 7, 8, 9]
};

/**
 * Rights that already belong to every tenant and landlord in South Africa
 * under the Rental Housing Act 50 of 1999. Section numbers included so a
 * user can look them up, or quote them to a landlord who disputes it.
 *
 * This is the platform's real scam protection. A tenant who knows the
 * deposit must sit in an interest-bearing account and come back within
 * 7 days is much harder to cheat than one relying on a warning banner.
 */
const LAW_SOURCE_URL = 'https://www.saflii.org/za/legis/consol_act/rha1999171/';

const tenantRights = [
  {
    section: 's 5(3)(d)',
    title: 'Your deposit must earn interest for you',
    detail: 'The landlord must place your deposit in an interest-bearing account at a rate no lower than a savings account, and must pay you that interest. You may ask, in writing, for proof of the interest that has accrued.'
  },
  {
    section: 's 5(3)(e) and (f)',
    title: 'You inspect the room together, twice',
    detail: 'You and the landlord must inspect the room together before you move in, to record any existing defects, and again within three days before the lease ends. If the landlord skips the final inspection, they lose the right to claim against your deposit.'
  },
  {
    section: 's 5(3)(i), (g) and (m)',
    title: 'Deadlines for getting your deposit back',
    detail: 'If you owe nothing, the deposit plus interest must be repaid within 7 days of the lease ending. Where the landlord repairs damage, it is 14 days from restoration of the room. Any remaining balance must be paid within 21 days of the lease ending.'
  },
  {
    section: 's 5(2)',
    title: 'You can demand a written lease',
    detail: 'If you ask for it, the landlord must put the lease in writing. A verbal agreement is still a valid lease, but written terms are far easier to enforce.'
  },
  {
    section: 's 5(3)(a) and (b)',
    title: 'Every payment gets a written receipt',
    detail: 'The landlord must give you a dated written receipt for every payment, showing the address and stating whether the money was rent, arrears or deposit. Refusing to issue receipts is an unfair practice.'
  },
  {
    section: 's 4(2) and 4(3)',
    title: 'Your room is your home',
    detail: 'You have a right to privacy. The landlord may inspect only in a reasonable manner and after reasonable notice, and may not search you, your room or your property.'
  }
];

/**
 * Where a tenant or a landlord goes when the other side will not budge.
 * Free service. Contacts as published by the National Department of Human
 * Settlements; verify before relying on them, as government numbers move.
 */
const rentalHousingTribunal = {
  province: 'Gauteng',
  isFree: true,
  address: 'Ikusaka House, 4th Floor, 129 Fox Street, Johannesburg',
  phone: '011 630 5036',
  handles: [
    'A deposit that is not refunded',
    'Illegal lockouts and illegal evictions',
    'Water or electricity cut off without a court order',
    'Failure to maintain the property',
    'Harassment or intimidation',
    'Exploitative rentals and discrimination against a prospective tenant'
  ],
  source: 'National Department of Human Settlements, Rental Housing Tribunal booklet',
  sourceUrl: 'https://www.dhs.gov.za/sites/default/files/publications/RENTAL%20HOUSING%20TRIBUNAL2.pdf',
  capturedOn: CAPTURED_ON
};

/**
 * One plain-text block the AI advisor can paste into its system prompt, so
 * the model reasons from sourced figures instead of from its own guesses.
 */
function buildMarketFactsPrompt() {
  const bands = rentBands
    .map(b => `- ${b.label}: R${b.minRent} to R${b.maxRent} per month (asking prices, ${b.source}, checked ${b.capturedOn}). ${b.note}`)
    .join('\n');

  const rights = tenantRights
    .map(r => `- ${r.title} (Rental Housing Act 50 of 1999, ${r.section}): ${r.detail}`)
    .join('\n');

  return `Asking rents observed on public listing portals for Soweto:
${bands}

These are asking prices from live adverts, not verified averages. Always tell the user the range and the date it was checked, and never state a single exact "market price" as if it were a fact.

Rights that already apply to every tenant under South African law:
${rights}

Free dispute resolution: the ${rentalHousingTribunal.province} Rental Housing Tribunal (${rentalHousingTribunal.address}, ${rentalHousingTribunal.phone}) hears rental disputes at no cost to either the tenant or the landlord.`;
}

module.exports = {
  capturedOn: CAPTURED_ON,
  rentBands,
  suburbs,
  zonedSuburbs,
  tenantRights,
  lawSourceUrl: LAW_SOURCE_URL,
  rentalHousingTribunal,
  buildMarketFactsPrompt
};
