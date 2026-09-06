export const STATUS_LOCATION_CITIES = [
  'Falkenberg',
  'Halmstad',
  'Helsingborg',
  'Lund',
  'Malmö',
  'Trelleborg',
  'Varberg',
  'Ängelholm',
] as const;

export const STATUS_LOCATION_STATIONS: Record<string, readonly string[]> = {
  Falkenberg: ['Falkenberg'],
  Halmstad: ['BVH (Hedin multi)', 'Flyget Halmstad', 'FORD Halmstad', 'KIA Halmstad', 'MB Halmstad'],
  Helsingborg: ['B/S Klippan', 'BMW Helsingborg', 'Euromaster Helsingborg', 'FORD Helsingborg', 'HBSC Helsingborg', 'KIA Helsingborg', 'MB Helsingborg', 'S. Jönsson', 'Transport Helsingborg'],
  Lund: ['B/S Lund', 'FORD Lund', 'Hedin Lund', 'P7 Revinge'],
  Malmö: ['FORD Malmö', 'Hedbergs Malmö', 'Hedin Automotive Burlöv', 'Malmö Automera', 'MB Malmö', 'Mechanum', 'Sturup', 'Werksta Malmö Hamn', 'Werksta St Bernstorp'],
  Trelleborg: ['Trelleborg'],
  Varberg: ['Autoklinik (Sällstorp)', 'Finnveden plåt', 'FORD Varberg', 'MB Varberg', 'Varberg multi (Hedin)'],
  Ängelholm: ['Flyget Ängelholm', 'FORD Ängelholm', 'Mekonomen Ängelholm'],
};
