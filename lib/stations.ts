// lib/stations.ts
export type Station = { id: string; name: string };
export type StationTree = Record<string, Station[]>;

export const STATIONS: StationTree = {
  'Ängelholm': [
    { id: 'angelholm-hedin-ford', name: 'Hedin Automotive Ford' },
    { id: 'angelholm-hedin', name: 'Hedin Automotive' },
    { id: 'angelholm-airport', name: 'Ängelholm Airport' },
  ],
  'Falkenberg': [{ id: 'falkenberg', name: 'Falkenberg' }],
  'Halmstad': [
    { id: 'halmstad-hedin-ford', name: 'Hedin Automotive Ford' },
    { id: 'halmstad-hedin-kia', name: 'Hedin Automotive Kia' },
    { id: 'halmstad-hedin-mercedes', name: 'Hedin Automotive Mercedes' },
    { id: 'halmstad-hedin', name: 'Hedin Automotive' },
    { id: 'halmstad-city-airport', name: 'Halmstad City Airport' },
  ],
  'Helsingborg': [
    { id: 'helsingborg-bilskadeservice', name: 'Bil & Skadeservice' },
    { id: 'helsingborg-floretten', name: 'Floretten' },
    { id: 'helsingborg-forenade-bil', name: 'Förenade Bil' },
    { id: 'helsingborg-hedin-ford', name: 'Hedin Automotive Ford' },
    { id: 'helsingborg-hedin-kia', name: 'Hedin Automotive Kia' },
    { id: 'helsingborg-hedin', name: 'Hedin Automotive' },
    { id: 'helsingborg-hedin-transport', name: 'Hedin Bil Transport' },
    { id: 'helsingborg-sjonsson', name: 'S.Jönsson Bil' },
    { id: 'helsingborg-verkstad', name: 'Verkstad' },
    { id: 'helsingborg-hbsc', name: 'HBSC' },
  ],
  'Lund': [
    { id: 'lund-bilskadeservice', name: 'Bil & Skadeservice' },
    { id: 'lund-hedin-ford', name: 'Hedin Automotive Ford' },
    { id: 'lund-hedin', name: 'Hedin Automotive' },
    { id: 'lund-hedin-bil', name: 'Hedin Bil' },
    { id: 'lund-p7-revingehed', name: 'P7 Revingehed' },
  ],
  'Malmö': [
    { id: 'malmo-automerna', name: 'Automerna' },
    { id: 'malmo-hedin-ford', name: 'Hedin Automotive Ford' },
    { id: 'malmo-hedin-jagersro', name: 'Hedin Automotive Jägersro' },
    { id: 'malmo-hedin-mercedes', name: 'Hedin Automotive Mercedes' },
    { id: 'malmo-mechanum', name: 'Mechanum' },
    { id: 'malmo-airport', name: 'Malmö Airport' },
    { id: 'malmo-bernstorp-verkstad', name: 'BERNSTORP (Verkstad)' },
    { id: 'malmo-burlov-hedin', name: 'BURLÖV (Hedin Automotive)' },
    { id: 'malmo-fosie-hedbergs', name: 'FOSIE (Hedbergs Bil)' },
    { id: 'malmo-hamn-verkstad', name: 'HAMN (Verkstad)' },
    { id: 'malmo-langtid', name: 'LÅNGTID' },
  ],
  'Trelleborg': [{ id: 'trelleborg', name: 'Trelleborg' }],
  'Varberg': [
    { id: 'varberg-finnvedens-skadecenter', name: 'Finnvedens Bil Skadecenter' },
    { id: 'varberg-hedin-ford', name: 'Hedin Automotive Ford' },
    { id: 'varberg-hedin-holmgarde', name: 'Hedin Automotive Holmgärde' },
    { id: 'varberg-hedin', name: 'Hedin Automotive' },
    { id: 'varberg-sallstorps-plat-lack', name: 'Sällstorps Plåt & Lack' },
  ],
  'X (Old)': [{ id: 'x-old-helsingborg-holmgrens', name: 'HELSINGBORG (Holmgrens Bil)' }],
};
