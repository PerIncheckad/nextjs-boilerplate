'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

// Constants
const MABI_LOGO_URL = "https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MABI%20Syd%20logga/MABI%20Syd%20logga%202.png";
const BACKGROUND_IMAGE_URL = "https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/Silver%20logo%20white%20bkgrd/MB-logo-white-logo.jpg";

const ORTER = ['Malmö', 'Helsingborg', 'Ängelholm', 'Halmstad', 'Falkenberg', 'Trelleborg', 'Varberg', 'Lund'].sort();

// Huvudstationer for Planerad Station and Saluinfo
const HUVUDSTATIONER = [
  { name: 'Falkenberg', id: 282 },
  { name: 'Halmstad', id: 274 },
  { name: 'Helsingborg', id: 170 },
  { name: 'Lund', id: 406 },
  { name: 'Malmö', id: 166 },
  { name: 'Trelleborg', id: 283 },
  { name: 'Varberg', id: 290 },
  { name: 'Ängelholm', id: 171 }
];

// Car brands for dropdown
const BILMARKEN = ['BMW', 'Citroen', 'Ford', 'KIA', 'MB', 'MG', 'Opel', 'Peugeot', 'Renault', 'SEAT', 'VW', 'Annat'];

const STATIONER: Record<string, string[]> = {
  'Malmö': ['FORD Malmö', 'MB Malmö', 'Mechanum', 'Malmö Automera', 'Mercedes Malmö', 'Werksta St Bernstorp', 'Werksta Malmö Hamn', 'Hedbergs Malmö', 'Hedin Automotive Burlöv', 'Sturup'],
  'Helsingborg': ['MB Helsingborg', 'HBSC Helsingborg', 'FORD Helsingborg', 'Transport Helsingborg', 'S. Jönsson', 'BMW Helsingborg', 'KIA Helsingborg', 'Euromaster Helsingborg', 'B/S Klippan', 'Euromaster Helsingborg Däckhotell', 'Bilia Helsingborg', 'Mekonomen Helsingborg Berga', 'Werksta Helsingborg', 'Svensk Bilåtervinning', 'Hedin Helsingborg', 'KKV Helsingborg', 'Hedbergs Helsingborg', 'Bilia Ängelholm', 'Euromaster Ängelholm', 'Mekonomen Ängelholm', 'Flyget Ängelholm'],
  'Lund': ['FORD Lund', 'Hedin Lund', 'B/S Lund', 'P7 Revinge'],
  'Ängelholm': ['FORD Ängelholm', 'Mekonomen Ängelholm', 'Flyget Ängelholm'],
  'Falkenberg': ['Falkenberg'],
  'Halmstad': ['Flyget Halmstad', 'KIA Halmstad', 'FORD Halmstad'],
  'Trelleborg': ['Trelleborg'],
  'Varberg': ['FORD Varberg', 'Hedin Automotive Varberg', 'Sällstorp lack plåt', 'Finnveden plåt']
};

const capitalizeFirstLetter = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

const getFirstNameFromEmail = (email: string): string => {
  if (!email) return 'Okänd';
  const namePart = email.split('@')[0];
  const firstName = namePart.split('.')[0];
  return capitalizeFirstLetter(firstName);
};

const getFullNameFromEmail = (email: string): string => {
  if (!email) return 'Okänd';
  const namePart = email.split('@')[0];
  const parts = namePart.split('.');
  if (parts.length >= 2) {
    const firstName = capitalizeFirstLetter(parts[0]);
    const lastName = capitalizeFirstLetter(parts[1]);
    return `${firstName} ${lastName}`;
  }
  return capitalizeFirstLetter(parts[0]);
};

// Fuel type constants
const FUEL_TYPES = {
  BENSIN: 'Bensin',
  DIESEL: 'Diesel',
  HYBRID_BENSIN: 'Hybrid (bensin)',
  HYBRID_DIESEL: 'Hybrid (diesel)',
  EL_FULL: '100% el'
} as const;

// Regex for Swedish license plate validation
const REG_NR_REGEX = /^[A-Z]{3}[0-9]{2}[0-9A-Z]$/;

export default function NybilForm() {
  const [firstName, setFirstName] = useState('');
  const [fullName, setFullName] = useState('');
  const [regInput, setRegInput] = useState('');
  const [bilmarke, setBilmarke] = useState('');
  const [bilmarkeAnnat, setBilmarkeAnnat] = useState('');
  const [modell, setModell] = useState('');
  const [ort, setOrt] = useState('');
  const [station, setStation] = useState('');
  
  // Planerad station
  const [planeradStation, setPlaneradStation] = useState('');
  
  // Vehicle status
  const [matarstallning, setMatarstallning] = useState('');
  const [hjultyp, setHjultyp] = useState<'Sommardäck' | 'Vinterdäck' | null>(null);
  
  // Wheels to storage (now in Fordonsstatus section)
  const [hjulTillForvaring, setHjulTillForvaring] = useState<'Vinterdäck' | 'Sommardäck' | 'Inga medföljande hjul' | null>(null);
  const [hjulForvaringOrt, setHjulForvaringOrt] = useState('');
  const [hjulForvaringSpec, setHjulForvaringSpec] = useState('');
  
  // Fuel/charging
  const [bransletyp, setBransletyp] = useState<'Bensin' | 'Diesel' | 'Hybrid (bensin)' | 'Hybrid (diesel)' | '100% el' | null>(null);
  const [vaxel, setVaxel] = useState<'Automat' | 'Manuell' | null>(null);
  const [laddnivaProcent, setLaddnivaProcent] = useState('');
  const [tankstatus, setTankstatus] = useState<'mottogs_fulltankad' | 'tankad_nu' | 'ej_upptankad' | null>(null);
  const [upptankningLiter, setUpptankningLiter] = useState('');
  const [upptankningLiterpris, setUpptankningLiterpris] = useState('');
  
  // Contract terms (AVTALSVILLKOR)
  const [serviceintervall, setServiceintervall] = useState<'1500' | '2500' | '3000' | 'Annat' | null>(null);
  const [serviceintervallAnnat, setServiceintervallAnnat] = useState('');
  const [maxKmManad, setMaxKmManad] = useState<'1200' | '3000' | 'Annat' | null>(null);
  const [maxKmManadAnnat, setMaxKmManadAnnat] = useState('');
  const [avgiftOverKm, setAvgiftOverKm] = useState<'1' | '2' | 'Annat' | null>(null);
  const [avgiftOverKmAnnat, setAvgiftOverKmAnnat] = useState('');
  
  // Equipment inventory
  const [antalInsynsskydd, setAntalInsynsskydd] = useState<null | 0 | 1 | 2>(null);
  const [instruktionsbok, setInstruktionsbok] = useState<boolean | null>(null);
  const [instruktionsbokForvaringOrt, setInstruktionsbokForvaringOrt] = useState('');
  const [instruktionsbokForvaringSpec, setInstruktionsbokForvaringSpec] = useState('');
  const [coc, setCoc] = useState<boolean | null>(null);
  const [cocForvaringOrt, setCocForvaringOrt] = useState('');
  const [cocForvaringSpec, setCocForvaringSpec] = useState('');
  const [antalNycklar, setAntalNycklar] = useState<null | 1 | 2>(null);
  const [extranyckelForvaringOrt, setExtranyckelForvaringOrt] = useState('');
  const [extranyckelForvaringSpec, setExtranyckelForvaringSpec] = useState('');
  const [antalLaddkablar, setAntalLaddkablar] = useState<null | 0 | 1 | 2>(null);
  const [laddkablarForvaringOrt, setLaddkablarForvaringOrt] = useState('');
  const [laddkablarForvaringSpec, setLaddkablarForvaringSpec] = useState('');
  const [lasbultarMed, setLasbultarMed] = useState<boolean | null>(null);
  const [dragkrok, setDragkrok] = useState<boolean | null>(null);
  const [gummimattor, setGummimattor] = useState<boolean | null>(null);
  const [dackkompressor, setDackkompressor] = useState<boolean | null>(null);
  const [stoldGps, setStoldGps] = useState<boolean | null>(null);
  const [stoldGpsSpec, setStoldGpsSpec] = useState('');
  
  // Connectivity (UPPKOPPLING)
  const [mbmeAktiverad, setMbmeAktiverad] = useState<boolean | null>(null);
  const [vwConnectAktiverad, setVwConnectAktiverad] = useState<boolean | null>(null);
  
  // Current location
  const [platsAktuellOrt, setPlatsAktuellOrt] = useState('');
  const [platsAktuellStation, setPlatsAktuellStation] = useState('');
  const [matarstallningAktuell, setMatarstallningAktuell] = useState('');
  
  // Saluinfo (optional)
  const [saludatum, setSaludatum] = useState('');
  const [saluStation, setSaluStation] = useState('');
  
  // Buyer info (KÖPARE - optional)
  const [kopareForetag, setKopareForetag] = useState('');
  const [returort, setReturort] = useState('');
  const [returadress, setReturadress] = useState('');
  const [attention, setAttention] = useState('');
  const [noteringForsaljning, setNoteringForsaljning] = useState('');
  
  // Notes (ÖVRIGT)
  const [anteckningar, setAnteckningar] = useState('');
  
  // Ready for rental (KLAR FÖR UTHYRNING)
  const [klarForUthyrning, setKlarForUthyrning] = useState<boolean | null>(null);
  const [ejUthyrningsbarAnledning, setEjUthyrningsbarAnledning] = useState('');
  
  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [showFieldErrors, setShowFieldErrors] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showRegWarningModal, setShowRegWarningModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [matarstallningError, setMatarstallningError] = useState('');
  
  const normalizedReg = useMemo(() => regInput.toUpperCase().replace(/\s/g, ''), [regInput]);
  const availableStations = useMemo(() => STATIONER[ort] || [], [ort]);
  const availableStationsAktuell = useMemo(() => STATIONER[platsAktuellOrt] || [], [platsAktuellOrt]);
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  
  const isElectric = bransletyp === FUEL_TYPES.EL_FULL;
  const isHybrid = bransletyp === FUEL_TYPES.HYBRID_BENSIN || bransletyp === FUEL_TYPES.HYBRID_DIESEL;
  const isBensinOrDiesel = bransletyp === FUEL_TYPES.BENSIN || bransletyp === FUEL_TYPES.DIESEL;
  const needsLaddkablar = isElectric || isHybrid;
  const needsVaxelQuestion = isBensinOrDiesel;
  const locationDiffers = platsAktuellOrt && platsAktuellStation && (platsAktuellOrt !== ort || platsAktuellStation !== station);
  const wheelsNeedStorage = hjulTillForvaring === 'Vinterdäck' || hjulTillForvaring === 'Sommardäck';
  
  // For UPPKOPPLING section visibility
  const showMbmeQuestion = bilmarke === 'MB';
  const showVwConnectQuestion = bilmarke === 'VW';
  const showUppkopplingSection = showMbmeQuestion || showVwConnectQuestion;
  
  // Charging cables storage needed check
  const laddkablarNeedsStorage = useMemo(() => {
    if (isHybrid && antalLaddkablar !== null && antalLaddkablar >= 1) return true;
    if (isElectric && antalLaddkablar !== null && antalLaddkablar > 1) return true;
    return false;
  }, [isHybrid, isElectric, antalLaddkablar]);
  
  const hasFordonStatusErrors = useMemo(() => {
    if (!matarstallning || !hjultyp || !bransletyp || hjulTillForvaring === null) return true;
    if (needsVaxelQuestion && vaxel === null) return true;
    if (wheelsNeedStorage && (!hjulForvaringOrt || !hjulForvaringSpec.trim())) return true;
    if (isElectric && !laddnivaProcent) return true;
    if (!isElectric && (!tankstatus || (tankstatus === 'tankad_nu' && (!upptankningLiter || !upptankningLiterpris)))) return true;
    return false;
  }, [matarstallning, hjultyp, bransletyp, hjulTillForvaring, needsVaxelQuestion, vaxel, wheelsNeedStorage, hjulForvaringOrt, hjulForvaringSpec, isElectric, laddnivaProcent, tankstatus, upptankningLiter, upptankningLiterpris]);
  
  const handleLaddningChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '') { 
      setLaddnivaProcent(''); 
      return; 
    }
    const num = parseInt(val, 10);
    if (!isNaN(num)) {
      setLaddnivaProcent(num > 100 ? '100' : num < 0 ? '0' : val);
    }
  };
  
  // Helper function to reset fuel-related fields when changing fuel type
  const handleFuelTypeChange = (newFuelType: typeof bransletyp) => {
    setBransletyp(newFuelType);
    setTankstatus(null);
    setLaddnivaProcent('');
    setUpptankningLiter('');
    setUpptankningLiterpris('');
    setVaxel(null);
    setAntalLaddkablar(null);
    setLaddkablarForvaringOrt('');
    setLaddkablarForvaringSpec('');
  };
  
  // Helper function to handle brand change and reset related fields
  const handleBrandChange = (newBrand: string) => {
    setBilmarke(newBrand);
    setBilmarkeAnnat('');
    setMbmeAktiverad(null);
    setVwConnectAktiverad(null);
  };
  
  const equipmentMissing = useMemo(() => {
    if (antalInsynsskydd === null) return true;
    if (instruktionsbok === null) return true;
    if (instruktionsbok === true && (!instruktionsbokForvaringOrt || !instruktionsbokForvaringSpec.trim())) return true;
    if (coc === null) return true;
    if (coc === true && (!cocForvaringOrt || !cocForvaringSpec.trim())) return true;
    if (antalNycklar === null) return true;
    if (antalNycklar === 2 && (!extranyckelForvaringOrt || !extranyckelForvaringSpec.trim())) return true;
    if (needsLaddkablar && antalLaddkablar === null) return true;
    if (laddkablarNeedsStorage && (!laddkablarForvaringOrt || !laddkablarForvaringSpec.trim())) return true;
    if (lasbultarMed === null) return true;
    if (dragkrok === null) return true;
    if (gummimattor === null) return true;
    if (dackkompressor === null) return true;
    if (stoldGps === null) return true;
    if (stoldGps === true && !stoldGpsSpec.trim()) return true;
    return false;
  }, [antalInsynsskydd, instruktionsbok, instruktionsbokForvaringOrt, instruktionsbokForvaringSpec, coc, cocForvaringOrt, cocForvaringSpec, antalNycklar, extranyckelForvaringOrt, extranyckelForvaringSpec, needsLaddkablar, antalLaddkablar, laddkablarNeedsStorage, laddkablarForvaringOrt, laddkablarForvaringSpec, lasbultarMed, dragkrok, gummimattor, dackkompressor, stoldGps, stoldGpsSpec]);
  
  const avtalsvillkorMissing = useMemo(() => {
    if (serviceintervall === null) return true;
    if (serviceintervall === 'Annat' && !serviceintervallAnnat.trim()) return true;
    if (maxKmManad === null) return true;
    if (maxKmManad === 'Annat' && !maxKmManadAnnat.trim()) return true;
    if (avgiftOverKm === null) return true;
    if (avgiftOverKm === 'Annat' && !avgiftOverKmAnnat.trim()) return true;
    return false;
  }, [serviceintervall, serviceintervallAnnat, maxKmManad, maxKmManadAnnat, avgiftOverKm, avgiftOverKmAnnat]);
  
  const uppkopplingMissing = useMemo(() => {
    if (showMbmeQuestion && mbmeAktiverad === null) return true;
    if (showVwConnectQuestion && vwConnectAktiverad === null) return true;
    return false;
  }, [showMbmeQuestion, mbmeAktiverad, showVwConnectQuestion, vwConnectAktiverad]);
  
  const klarForUthyrningMissing = useMemo(() => {
    if (klarForUthyrning === null) return true;
    if (klarForUthyrning === false && !ejUthyrningsbarAnledning.trim()) return true;
    return false;
  }, [klarForUthyrning, ejUthyrningsbarAnledning]);
  
  const formIsValid = useMemo(() => {
    // Required basic fields - FORDON
    if (!regInput || !bilmarke || !modell) return false;
    if (bilmarke === 'Annat' && !bilmarkeAnnat.trim()) return false;
    // PLATS FÖR MOTTAGNING
    if (!ort || !station) return false;
    // PLANERAD STATION
    if (!planeradStation) return false;
    // FORDONSSTATUS
    if (hasFordonStatusErrors) return false;
    // AVTALSVILLKOR
    if (avtalsvillkorMissing) return false;
    // UTRUSTNING
    if (equipmentMissing) return false;
    // UPPKOPPLING (conditional)
    if (showUppkopplingSection && uppkopplingMissing) return false;
    // VAR ÄR BILEN NU?
    if (!platsAktuellOrt || !platsAktuellStation) return false;
    if (locationDiffers && !matarstallningAktuell) return false;
    // KLAR FÖR UTHYRNING
    if (klarForUthyrningMissing) return false;
    return true;
  }, [regInput, bilmarke, bilmarkeAnnat, modell, ort, station, planeradStation, hasFordonStatusErrors, avtalsvillkorMissing, equipmentMissing, showUppkopplingSection, uppkopplingMissing, platsAktuellOrt, platsAktuellStation, locationDiffers, matarstallningAktuell, klarForUthyrningMissing]);
  
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email || '';
      setFirstName(getFirstNameFromEmail(email));
      setFullName(getFullNameFromEmail(email));
    };
    getUser();
  }, []);
  
  // Prevent background scroll when confirm modal is open
  useEffect(() => {
    if (showConfirmModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { 
      document.body.style.overflow = ''; 
    };
  }, [showConfirmModal]);
  
  const handleShowErrors = () => {
    setShowFieldErrors(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const firstError = document.querySelector('.card[data-error="true"], .field[data-error="true"]') as HTMLElement | null;
        if (firstError) {
          const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          const rect = firstError.getBoundingClientRect();
          const targetTop = window.scrollY + rect.top - 80;
          try {
            window.scrollTo({ top: targetTop, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
          } catch {
            firstError.scrollIntoView({ block: 'center' });
          }
          setTimeout(() => {
            const focusable = firstError.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])') as HTMLElement | null;
            focusable?.focus();
          }, 150);
        }
      });
    });
  };
  
  const resetForm = () => {
    setRegInput('');
    setBilmarke('');
    setBilmarkeAnnat('');
    setModell('');
    setOrt('');
    setStation('');
    setPlaneradStation('');
    setMatarstallning('');
    setHjultyp(null);
    setHjulTillForvaring(null);
    setHjulForvaringOrt('');
    setHjulForvaringSpec('');
    setBransletyp(null);
    setVaxel(null);
    setLaddnivaProcent('');
    setTankstatus(null);
    setUpptankningLiter('');
    setUpptankningLiterpris('');
    setServiceintervall(null);
    setServiceintervallAnnat('');
    setMaxKmManad(null);
    setMaxKmManadAnnat('');
    setAvgiftOverKm(null);
    setAvgiftOverKmAnnat('');
    setAntalInsynsskydd(null);
    setInstruktionsbok(null);
    setInstruktionsbokForvaringOrt('');
    setInstruktionsbokForvaringSpec('');
    setCoc(null);
    setCocForvaringOrt('');
    setCocForvaringSpec('');
    setAntalNycklar(null);
    setExtranyckelForvaringOrt('');
    setExtranyckelForvaringSpec('');
    setAntalLaddkablar(null);
    setLaddkablarForvaringOrt('');
    setLaddkablarForvaringSpec('');
    setLasbultarMed(null);
    setDragkrok(null);
    setGummimattor(null);
    setDackkompressor(null);
    setStoldGps(null);
    setStoldGpsSpec('');
    setMbmeAktiverad(null);
    setVwConnectAktiverad(null);
    setPlatsAktuellOrt('');
    setPlatsAktuellStation('');
    setMatarstallningAktuell('');
    setSaludatum('');
    setSaluStation('');
    setKopareForetag('');
    setReturort('');
    setReturadress('');
    setAttention('');
    setNoteringForsaljning('');
    setAnteckningar('');
    setKlarForUthyrning(null);
    setEjUthyrningsbarAnledning('');
    setShowFieldErrors(false);
    setShowRegWarningModal(false);
    setShowConfirmModal(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
  // Check reg nr format before proceeding
  const isRegNrValid = REG_NR_REGEX.test(normalizedReg);
  
  const handleRegisterClick = () => {
    // Reset error
    setMatarstallningError('');
    
    if (!formIsValid) {
      handleShowErrors();
      return;
    }
    // Check reg nr format
    if (!isRegNrValid) {
      setShowRegWarningModal(true);
      return;
    }
    // Mätarställning validation: current must be greater than purchase
    if (matarstallningAktuell && matarstallning) {
      const inkopValue = parseInt(matarstallning, 10);
      const aktuellValue = parseInt(matarstallningAktuell, 10);
      if (!isNaN(inkopValue) && !isNaN(aktuellValue) && aktuellValue <= inkopValue) {
        setMatarstallningError('Aktuell mätarställning måste vara större än mätarställning vid inköp.');
        handleShowErrors();
        // Scroll to the error field
        const errorField = document.querySelector('[data-field="matarstallning-aktuell"]');
        if (errorField) {
          errorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }
    }
    // Show confirmation modal
    setShowConfirmModal(true);
  };
  
  const handleConfirmAndSubmit = async () => {
    setShowConfirmModal(false);
    setShowRegWarningModal(false);
    setIsSaving(true);
    try {
      const now = new Date();
      const planeradStationObj = HUVUDSTATIONER.find(s => s.name === planeradStation);
      // Determine effective vaxel value
      const effectiveVaxel = needsVaxelQuestion ? vaxel : 'Automat';
      // Determine effective bilmarke
      const effectiveBilmarke = bilmarke === 'Annat' ? bilmarkeAnnat : bilmarke;
      
      const inventoryData = {
        regnr: normalizedReg,
        bilmarke: effectiveBilmarke,
        bilmarke_annat: bilmarke === 'Annat' ? bilmarkeAnnat : null,
        modell,
        registrerad_av: firstName,
        fullstandigt_namn: fullName,
        registreringsdatum: now.toISOString().split('T')[0],
        plats_mottagning_ort: ort,
        plats_mottagning_station: station,
        planerad_station: planeradStation,
        planerad_station_id: planeradStationObj?.id || null,
        matarstallning_inkop: matarstallning,
        hjultyp,
        hjul_ej_monterade: hjulTillForvaring,
        hjul_forvaring_ort: wheelsNeedStorage ? hjulForvaringOrt : null,
        hjul_forvaring: wheelsNeedStorage ? hjulForvaringSpec : null,
        bransletyp,
        vaxel: effectiveVaxel,
        laddniva_procent: isElectric && laddnivaProcent ? parseInt(laddnivaProcent, 10) : null,
        tankstatus: !isElectric ? tankstatus : null,
        upptankning_liter: !isElectric && tankstatus === 'tankad_nu' && upptankningLiter ? parseFloat(upptankningLiter) : null,
        upptankning_literpris: !isElectric && tankstatus === 'tankad_nu' && upptankningLiterpris ? parseFloat(upptankningLiterpris) : null,
        serviceintervall: serviceintervall === 'Annat' ? serviceintervallAnnat : serviceintervall,
        max_km_manad: maxKmManad === 'Annat' ? maxKmManadAnnat : maxKmManad,
        avgift_over_km: avgiftOverKm === 'Annat' ? avgiftOverKmAnnat : avgiftOverKm,
        antal_insynsskydd: antalInsynsskydd,
        instruktionsbok: instruktionsbok,
        instruktionsbok_forvaring_ort: instruktionsbok ? instruktionsbokForvaringOrt : null,
        instruktionsbok_forvaring_spec: instruktionsbok ? instruktionsbokForvaringSpec : null,
        coc: coc,
        coc_forvaring_ort: coc ? cocForvaringOrt : null,
        coc_forvaring_spec: coc ? cocForvaringSpec : null,
        antal_nycklar: antalNycklar,
        extranyckel_forvaring_ort: antalNycklar === 2 ? extranyckelForvaringOrt : null,
        extranyckel_forvaring_spec: antalNycklar === 2 ? extranyckelForvaringSpec : null,
        antal_laddkablar: needsLaddkablar ? (antalLaddkablar ?? 0) : 0,
        laddkablar_forvaring_ort: laddkablarNeedsStorage ? laddkablarForvaringOrt : null,
        laddkablar_forvaring_spec: laddkablarNeedsStorage ? laddkablarForvaringSpec : null,
        lasbultar_med: lasbultarMed,
        dragkrok,
        gummimattor,
        dackkompressor,
        stold_gps: stoldGps,
        stold_gps_spec: stoldGps ? stoldGpsSpec : null,
        mbme_aktiverad: showMbmeQuestion ? mbmeAktiverad : null,
        vw_connect_aktiverad: showVwConnectQuestion ? vwConnectAktiverad : null,
        plats_aktuell_ort: platsAktuellOrt,
        plats_aktuell_station: platsAktuellStation,
        matarstallning_aktuell: locationDiffers ? matarstallningAktuell : null,
        saludatum: saludatum || null,
        salu_station: saluStation || null,
        kopare_foretag: kopareForetag || null,
        returort: returort || null,
        returadress: returadress || null,
        attention: attention || null,
        notering_forsaljning: noteringForsaljning || null,
        anteckningar: anteckningar || null,
        klar_for_uthyrning: klarForUthyrning,
        ej_uthyrningsbar_anledning: klarForUthyrning === false ? ejUthyrningsbarAnledning : null,
        photo_urls: [],
        video_urls: [],
        media_folder: null
      };
      const { data, error } = await supabase
        .from('nybil_inventering')
        .insert([inventoryData])
        .select();
      if (error) {
        console.error('Database error:', error);
        alert(`Fel vid sparande: ${error.message}`);
        return;
      }
      console.log('Successfully saved:', data);
      setShowSuccessModal(true);
      setTimeout(() => {
        setShowSuccessModal(false);
        resetForm();
      }, 3000);
    } catch (error) {
      console.error('Save error:', error);
      alert('Något gick fel vid sparande. Vänligen försök igen.');
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleCancel = () => {
    if (confirm('Är du säker? Alla ifyllda data kommer att raderas.')) {
      resetForm();
    }
  };
  
  // Get formatted summary for confirmation modal
  const getFormSummary = () => {
    const effectiveBilmarke = bilmarke === 'Annat' ? bilmarkeAnnat : bilmarke;
    const effectiveVaxel = needsVaxelQuestion ? vaxel : 'Automat';
    const effectiveServiceintervall = serviceintervall === 'Annat' ? serviceintervallAnnat : serviceintervall;
    const effectiveMaxKm = maxKmManad === 'Annat' ? maxKmManadAnnat : maxKmManad;
    const effectiveAvgift = avgiftOverKm === 'Annat' ? avgiftOverKmAnnat : avgiftOverKm;
    
    // Build laddkablar förvaring string
    let laddkablarForvaring = '';
    if (laddkablarNeedsStorage && laddkablarForvaringOrt && laddkablarForvaringSpec) {
      laddkablarForvaring = `${laddkablarForvaringOrt}, ${laddkablarForvaringSpec}`;
    }
    
    return {
      fordon: {
        regnr: normalizedReg,
        bilmarke: effectiveBilmarke,
        modell
      },
      mottagning: {
        ort,
        station
      },
      planeradStation,
      status: {
        matarstallning,
        matarstallningAktuell: locationDiffers ? matarstallningAktuell : '',
        hjultyp,
        hjulTillForvaring,
        bransletyp,
        vaxel: effectiveVaxel
      },
      avtalsvillkor: {
        serviceintervall: effectiveServiceintervall,
        maxKmManad: effectiveMaxKm,
        avgiftOverKm: effectiveAvgift
      },
      stoldGps,
      stoldGpsSpec,
      saludatum: saludatum || '',
      // Utrustning fields
      antalInsynsskydd,
      instruktionsbok,
      instruktionsbokForvaringOrt,
      instruktionsbokForvaringSpec,
      coc,
      cocForvaringOrt,
      cocForvaringSpec,
      antalNycklar,
      extranyckelForvaringOrt,
      extranyckelForvaringSpec,
      antalLaddkablar,
      laddkablarForvaring,
      lasbultarMed,
      dragkrok,
      gummimattor,
      dackkompressor,
      hjulForvaringOrt,
      hjulForvaringSpec,
      klarForUthyrning: klarForUthyrning ? 'Ja' : 'Nej'
    };
  };
  
  return (
    <div className="nybil-form">
      <GlobalStyles backgroundUrl={BACKGROUND_IMAGE_URL} />
      {isSaving && <SpinnerOverlay />}
      {showSuccessModal && <SuccessModal firstName={firstName} />}
      {showRegWarningModal && (
        <WarningModal
          title="Registreringsnummer"
          message={`Är du säker? ${normalizedReg} är inte i standardformat.`}
          onCancel={() => setShowRegWarningModal(false)}
          onConfirm={() => {
            setShowRegWarningModal(false);
            setShowConfirmModal(true);
          }}
          cancelText="Avbryt"
          confirmText="Fortsätt ändå"
        />
      )}
      {showConfirmModal && (
        <ConfirmationModal
          summary={getFormSummary()}
          onCancel={() => setShowConfirmModal(false)}
          onConfirm={handleConfirmAndSubmit}
        />
      )}
      <div className="main-header">
        <img src={MABI_LOGO_URL} alt="MABI Logo" className="main-logo" />
        {fullName && <p className="user-info">Inloggad: {fullName}</p>}
      </div>
      
      {/* FORDON Section */}
      <Card data-error={showFieldErrors && (!regInput || !bilmarke || !modell || (bilmarke === 'Annat' && !bilmarkeAnnat.trim()))}>
        <SectionHeader title="Fordon" />
        <Field label="Registreringsnummer *">
          <input type="text" value={regInput} onChange={(e) => setRegInput(e.target.value)} placeholder="ABC 123" className="reg-input" />
        </Field>
        <div className="grid-2-col">
          <Field label="Bilmärke *">
            <select value={bilmarke} onChange={(e) => handleBrandChange(e.target.value)}>
              <option value="">Välj bilmärke</option>
              {BILMARKEN.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </Field>
          <Field label="Modell *">
            <input type="text" value={modell} onChange={(e) => setModell(e.target.value)} placeholder="t.ex. T-Cross" />
          </Field>
        </div>
        {bilmarke === 'Annat' && (
          <Field label="Specificera bilmärke *">
            <input type="text" value={bilmarkeAnnat} onChange={(e) => setBilmarkeAnnat(e.target.value)} placeholder="Ange bilmärke" />
          </Field>
        )}
      </Card>
      
      {/* PLATS FÖR MOTTAGNING Section */}
      <Card data-error={showFieldErrors && (!ort || !station)}>
        <SectionHeader title="Plats för mottagning av ny bil" />
        <div className="grid-2-col">
          <Field label="Ort *">
            <select value={ort} onChange={e => { setOrt(e.target.value); setStation(''); }}>
              <option value="">Välj ort</option>
              {ORTER.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Station *">
            <select value={station} onChange={e => setStation(e.target.value)} disabled={!ort}>
              <option value="">Välj station</option>
              {availableStations.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>
      </Card>
      
      {/* PLANERAD STATION Section */}
      <Card data-error={showFieldErrors && !planeradStation}>
        <SectionHeader title="Planerad station" />
        <Field label="Planerad station *">
          <select value={planeradStation} onChange={e => setPlaneradStation(e.target.value)}>
            <option value="">Välj planerad station</option>
            {HUVUDSTATIONER.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </Field>
      </Card>
      
      {/* FORDONSSTATUS Section */}
      <Card data-error={showFieldErrors && hasFordonStatusErrors}>
        <SectionHeader title="Fordonsstatus" />
        <Field label="Mätarställning vid inköp (km) *">
          <input type="number" value={matarstallning} onChange={e => setMatarstallning(e.target.value)} placeholder="12345" />
        </Field>
        
        <SubSectionHeader title="Däck" />
        <Field label="Däcktyp som sitter på *">
          <div className="grid-2-col">
            <ChoiceButton onClick={() => setHjultyp('Sommardäck')} isActive={hjultyp === 'Sommardäck'} isSet={hjultyp !== null}>Sommardäck</ChoiceButton>
            <ChoiceButton onClick={() => setHjultyp('Vinterdäck')} isActive={hjultyp === 'Vinterdäck'} isSet={hjultyp !== null}>Vinterdäck</ChoiceButton>
          </div>
        </Field>
        <Field label="Hjul till förvaring *">
          <div className="grid-3-col">
            <ChoiceButton onClick={() => { setHjulTillForvaring('Vinterdäck'); setHjulForvaringOrt(''); setHjulForvaringSpec(''); }} isActive={hjulTillForvaring === 'Vinterdäck'} isSet={hjulTillForvaring !== null}>Vinterdäck</ChoiceButton>
            <ChoiceButton onClick={() => { setHjulTillForvaring('Sommardäck'); setHjulForvaringOrt(''); setHjulForvaringSpec(''); }} isActive={hjulTillForvaring === 'Sommardäck'} isSet={hjulTillForvaring !== null}>Sommardäck</ChoiceButton>
            <ChoiceButton onClick={() => { setHjulTillForvaring('Inga medföljande hjul'); setHjulForvaringOrt(''); setHjulForvaringSpec(''); }} isActive={hjulTillForvaring === 'Inga medföljande hjul'} isSet={hjulTillForvaring !== null}>Inga medföljande hjul</ChoiceButton>
          </div>
        </Field>
        {wheelsNeedStorage && (
          <>
            <Field label="Förvaringsort *">
              <select value={hjulForvaringOrt} onChange={e => setHjulForvaringOrt(e.target.value)}>
                <option value="">Välj förvaringsort</option>
                {ORTER.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Specificera förvaring av hjul *">
              <input type="text" value={hjulForvaringSpec} onChange={e => setHjulForvaringSpec(e.target.value)} placeholder="t.ex. Hylla 3, rum B" />
            </Field>
          </>
        )}
        
        <SubSectionHeader title="Drivmedel" />
        <Field label="Drivmedel *">
          <div className="grid-2-col">
            <ChoiceButton onClick={() => handleFuelTypeChange(FUEL_TYPES.BENSIN)} isActive={bransletyp === FUEL_TYPES.BENSIN} isSet={bransletyp !== null}>Bensin</ChoiceButton>
            <ChoiceButton onClick={() => handleFuelTypeChange(FUEL_TYPES.DIESEL)} isActive={bransletyp === FUEL_TYPES.DIESEL} isSet={bransletyp !== null}>Diesel</ChoiceButton>
          </div>
          <div className="grid-2-col" style={{ marginTop: '0.5rem' }}>
            <ChoiceButton onClick={() => handleFuelTypeChange(FUEL_TYPES.HYBRID_BENSIN)} isActive={bransletyp === FUEL_TYPES.HYBRID_BENSIN} isSet={bransletyp !== null}>Hybrid (bensin)</ChoiceButton>
            <ChoiceButton onClick={() => handleFuelTypeChange(FUEL_TYPES.HYBRID_DIESEL)} isActive={bransletyp === FUEL_TYPES.HYBRID_DIESEL} isSet={bransletyp !== null}>Hybrid (diesel)</ChoiceButton>
          </div>
          <div style={{ marginTop: '0.5rem' }}>
            <ChoiceButton onClick={() => handleFuelTypeChange(FUEL_TYPES.EL_FULL)} isActive={bransletyp === FUEL_TYPES.EL_FULL} isSet={bransletyp !== null} className="full-width-choice">100% el</ChoiceButton>
          </div>
        </Field>
        
        {/* Växel question - only for Bensin/Diesel */}
        {needsVaxelQuestion && (
          <Field label="Växel *">
            <div className="grid-2-col">
              <ChoiceButton onClick={() => setVaxel('Automat')} isActive={vaxel === 'Automat'} isSet={vaxel !== null}>Automat</ChoiceButton>
              <ChoiceButton onClick={() => setVaxel('Manuell')} isActive={vaxel === 'Manuell'} isSet={vaxel !== null}>Manuell</ChoiceButton>
            </div>
          </Field>
        )}
        
        {isElectric && (
          <Field label="Laddnivå (%) *">
            <input type="number" value={laddnivaProcent} onChange={handleLaddningChange} placeholder="0-100" min="0" max="100" />
          </Field>
        )}
        {!isElectric && bransletyp && (
          <>
            <Field label="Tankstatus *">
              <div className="grid-3-col">
                <ChoiceButton onClick={() => { setTankstatus('mottogs_fulltankad'); setUpptankningLiter(''); setUpptankningLiterpris(''); }} isActive={tankstatus === 'mottogs_fulltankad'} isSet={tankstatus !== null}>Mottogs fulltankad</ChoiceButton>
                <ChoiceButton onClick={() => setTankstatus('tankad_nu')} isActive={tankstatus === 'tankad_nu'} isSet={tankstatus !== null}>Tankad nu av MABI</ChoiceButton>
                <ChoiceButton onClick={() => { setTankstatus('ej_upptankad'); setUpptankningLiter(''); setUpptankningLiterpris(''); }} isActive={tankstatus === 'ej_upptankad'} isSet={tankstatus !== null}>Ej upptankad</ChoiceButton>
              </div>
            </Field>
            {tankstatus === 'tankad_nu' && (
              <div className="grid-2-col">
                <Field label="Antal liter *">
                  <input type="number" value={upptankningLiter} onChange={e => setUpptankningLiter(e.target.value)} placeholder="50" step="0.01" min="0" />
                </Field>
                <Field label="Literpris (kr) *">
                  <input type="number" value={upptankningLiterpris} onChange={e => setUpptankningLiterpris(e.target.value)} placeholder="20.50" step="0.01" min="0" />
                </Field>
              </div>
            )}
          </>
        )}
      </Card>
      
      {/* AVTALSVILLKOR Section */}
      <Card data-error={showFieldErrors && avtalsvillkorMissing}>
        <SectionHeader title="Avtalsvillkor" />
        <Field label="Serviceintervall *">
          <div className="grid-4-col">
            <ChoiceButton onClick={() => { setServiceintervall('1500'); setServiceintervallAnnat(''); }} isActive={serviceintervall === '1500'} isSet={serviceintervall !== null}>1500</ChoiceButton>
            <ChoiceButton onClick={() => { setServiceintervall('2500'); setServiceintervallAnnat(''); }} isActive={serviceintervall === '2500'} isSet={serviceintervall !== null}>2500</ChoiceButton>
            <ChoiceButton onClick={() => { setServiceintervall('3000'); setServiceintervallAnnat(''); }} isActive={serviceintervall === '3000'} isSet={serviceintervall !== null}>3000</ChoiceButton>
            <ChoiceButton onClick={() => setServiceintervall('Annat')} isActive={serviceintervall === 'Annat'} isSet={serviceintervall !== null}>Annat</ChoiceButton>
          </div>
        </Field>
        {serviceintervall === 'Annat' && (
          <Field label="Specificera serviceintervall *">
            <input type="number" value={serviceintervallAnnat} onChange={e => setServiceintervallAnnat(e.target.value)} placeholder="Ange serviceintervall" />
          </Field>
        )}
        <Field label="Max km/månad *">
          <div className="grid-3-col">
            <ChoiceButton onClick={() => { setMaxKmManad('1200'); setMaxKmManadAnnat(''); }} isActive={maxKmManad === '1200'} isSet={maxKmManad !== null}>1200</ChoiceButton>
            <ChoiceButton onClick={() => { setMaxKmManad('3000'); setMaxKmManadAnnat(''); }} isActive={maxKmManad === '3000'} isSet={maxKmManad !== null}>3000</ChoiceButton>
            <ChoiceButton onClick={() => setMaxKmManad('Annat')} isActive={maxKmManad === 'Annat'} isSet={maxKmManad !== null}>Annat</ChoiceButton>
          </div>
        </Field>
        {maxKmManad === 'Annat' && (
          <Field label="Specificera max km/månad *">
            <input type="number" value={maxKmManadAnnat} onChange={e => setMaxKmManadAnnat(e.target.value)} placeholder="Ange max km/månad" />
          </Field>
        )}
        <Field label="Avgift över-km *">
          <div className="grid-3-col">
            <ChoiceButton onClick={() => { setAvgiftOverKm('1'); setAvgiftOverKmAnnat(''); }} isActive={avgiftOverKm === '1'} isSet={avgiftOverKm !== null}>1 kr</ChoiceButton>
            <ChoiceButton onClick={() => { setAvgiftOverKm('2'); setAvgiftOverKmAnnat(''); }} isActive={avgiftOverKm === '2'} isSet={avgiftOverKm !== null}>2 kr</ChoiceButton>
            <ChoiceButton onClick={() => setAvgiftOverKm('Annat')} isActive={avgiftOverKm === 'Annat'} isSet={avgiftOverKm !== null}>Annat</ChoiceButton>
          </div>
        </Field>
        {avgiftOverKm === 'Annat' && (
          <Field label="Specificera avgift över-km *">
            <input type="number" value={avgiftOverKmAnnat} onChange={e => setAvgiftOverKmAnnat(e.target.value)} placeholder="Ange avgift" />
          </Field>
        )}
      </Card>
      
      {/* UTRUSTNING Section */}
      <Card data-error={showFieldErrors && equipmentMissing}>
        <SectionHeader title="Utrustning" />
        <Field label="Antal insynsskydd *">
          <div className="grid-3-col">
            <ChoiceButton onClick={() => setAntalInsynsskydd(0)} isActive={antalInsynsskydd === 0} isSet={antalInsynsskydd !== null}>0</ChoiceButton>
            <ChoiceButton onClick={() => setAntalInsynsskydd(1)} isActive={antalInsynsskydd === 1} isSet={antalInsynsskydd !== null}>1</ChoiceButton>
            <ChoiceButton onClick={() => setAntalInsynsskydd(2)} isActive={antalInsynsskydd === 2} isSet={antalInsynsskydd !== null}>2</ChoiceButton>
          </div>
        </Field>
        
        <Field label="Medföljande Instruktionsbok/Manual? *">
          <div className="grid-2-col">
            <ChoiceButton onClick={() => { setInstruktionsbok(true); }} isActive={instruktionsbok === true} isSet={instruktionsbok !== null}>Ja</ChoiceButton>
            <ChoiceButton onClick={() => { setInstruktionsbok(false); setInstruktionsbokForvaringOrt(''); setInstruktionsbokForvaringSpec(''); }} isActive={instruktionsbok === false} isSet={instruktionsbok !== null}>Nej</ChoiceButton>
          </div>
        </Field>
        {instruktionsbok === true && (
          <>
            <Field label="Förvaringsort *">
              <select value={instruktionsbokForvaringOrt} onChange={e => setInstruktionsbokForvaringOrt(e.target.value)}>
                <option value="">Välj förvaringsort</option>
                {ORTER.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Specificera förvaring av instruktionsbok *">
              <input type="text" value={instruktionsbokForvaringSpec} onChange={e => setInstruktionsbokForvaringSpec(e.target.value)} placeholder="t.ex. Hyllplats 18F" />
            </Field>
          </>
        )}
        
        <Field label="Medföljande COC? *">
          <div className="grid-2-col">
            <ChoiceButton onClick={() => { setCoc(true); }} isActive={coc === true} isSet={coc !== null}>Ja</ChoiceButton>
            <ChoiceButton onClick={() => { setCoc(false); setCocForvaringOrt(''); setCocForvaringSpec(''); }} isActive={coc === false} isSet={coc !== null}>Nej</ChoiceButton>
          </div>
        </Field>
        {coc === true && (
          <>
            <Field label="Förvaringsort *">
              <select value={cocForvaringOrt} onChange={e => setCocForvaringOrt(e.target.value)}>
                <option value="">Välj förvaringsort</option>
                {ORTER.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Specificera förvaring av COC *">
              <input type="text" value={cocForvaringSpec} onChange={e => setCocForvaringSpec(e.target.value)} placeholder="t.ex. Kontoret" />
            </Field>
          </>
        )}
        
        <Field label="Antal nycklar *">
          <div className="grid-2-col">
            <ChoiceButton onClick={() => { setAntalNycklar(1); setExtranyckelForvaringOrt(''); setExtranyckelForvaringSpec(''); }} isActive={antalNycklar === 1} isSet={antalNycklar !== null}>1</ChoiceButton>
            <ChoiceButton onClick={() => setAntalNycklar(2)} isActive={antalNycklar === 2} isSet={antalNycklar !== null}>2</ChoiceButton>
          </div>
        </Field>
        {antalNycklar === 2 && (
          <>
            <Field label="Förvaringsort *">
              <select value={extranyckelForvaringOrt} onChange={e => setExtranyckelForvaringOrt(e.target.value)}>
                <option value="">Välj förvaringsort</option>
                {ORTER.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Specificera förvaring av extranyckel *">
              <input type="text" value={extranyckelForvaringSpec} onChange={e => setExtranyckelForvaringSpec(e.target.value)} placeholder="t.ex. Nyckelskåp" />
            </Field>
          </>
        )}
        
        {/* Laddkablar - different logic for Hybrid vs Electric */}
        {needsLaddkablar && (
          <>
            <Field label="Antal laddkablar *">
              {isHybrid ? (
                <div className="grid-3-col">
                  <ChoiceButton onClick={() => { setAntalLaddkablar(0); setLaddkablarForvaringOrt(''); setLaddkablarForvaringSpec(''); }} isActive={antalLaddkablar === 0} isSet={antalLaddkablar !== null}>0</ChoiceButton>
                  <ChoiceButton onClick={() => setAntalLaddkablar(1)} isActive={antalLaddkablar === 1} isSet={antalLaddkablar !== null}>1</ChoiceButton>
                  <ChoiceButton onClick={() => setAntalLaddkablar(2)} isActive={antalLaddkablar === 2} isSet={antalLaddkablar !== null}>2</ChoiceButton>
                </div>
              ) : (
                <div className="grid-2-col">
                  <ChoiceButton onClick={() => { setAntalLaddkablar(1); setLaddkablarForvaringOrt(''); setLaddkablarForvaringSpec(''); }} isActive={antalLaddkablar === 1} isSet={antalLaddkablar !== null}>1</ChoiceButton>
                  <ChoiceButton onClick={() => setAntalLaddkablar(2)} isActive={antalLaddkablar === 2} isSet={antalLaddkablar !== null}>2</ChoiceButton>
                </div>
              )}
            </Field>
            {laddkablarNeedsStorage && (
              <>
                <Field label="Förvaringsort *">
                  <select value={laddkablarForvaringOrt} onChange={e => setLaddkablarForvaringOrt(e.target.value)}>
                    <option value="">Välj förvaringsort</option>
                    {ORTER.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </Field>
                <Field label="Specificera förvaring av laddkabel/laddkablar *">
                  <input type="text" value={laddkablarForvaringSpec} onChange={e => setLaddkablarForvaringSpec(e.target.value)} placeholder="t.ex. Hyllplats 9G" />
                </Field>
              </>
            )}
          </>
        )}
        
        <Field label="Låsbultar med? *">
          <div className="grid-2-col">
            <ChoiceButton onClick={() => setLasbultarMed(true)} isActive={lasbultarMed === true} isSet={lasbultarMed !== null}>Ja</ChoiceButton>
            <ChoiceButton onClick={() => setLasbultarMed(false)} isActive={lasbultarMed === false} isSet={lasbultarMed !== null}>Nej</ChoiceButton>
          </div>
        </Field>
        
        <Field label="Dragkrok *">
          <div className="grid-2-col">
            <ChoiceButton onClick={() => setDragkrok(true)} isActive={dragkrok === true} isSet={dragkrok !== null}>Ja</ChoiceButton>
            <ChoiceButton onClick={() => setDragkrok(false)} isActive={dragkrok === false} isSet={dragkrok !== null}>Nej</ChoiceButton>
          </div>
        </Field>
        
        <Field label="Gummimattor *">
          <div className="grid-2-col">
            <ChoiceButton onClick={() => setGummimattor(true)} isActive={gummimattor === true} isSet={gummimattor !== null}>Ja</ChoiceButton>
            <ChoiceButton onClick={() => setGummimattor(false)} isActive={gummimattor === false} isSet={gummimattor !== null}>Nej</ChoiceButton>
          </div>
        </Field>
        
        <Field label="Däckkompressor *">
          <div className="grid-2-col">
            <ChoiceButton onClick={() => setDackkompressor(true)} isActive={dackkompressor === true} isSet={dackkompressor !== null}>Ja</ChoiceButton>
            <ChoiceButton onClick={() => setDackkompressor(false)} isActive={dackkompressor === false} isSet={dackkompressor !== null}>Nej</ChoiceButton>
          </div>
        </Field>
        
        <Field label="Stöld-GPS monterad *">
          <div className="grid-2-col">
            <ChoiceButton onClick={() => setStoldGps(true)} isActive={stoldGps === true} isSet={stoldGps !== null}>Ja</ChoiceButton>
            <ChoiceButton onClick={() => { setStoldGps(false); setStoldGpsSpec(''); }} isActive={stoldGps === false} isSet={stoldGps !== null}>Nej</ChoiceButton>
          </div>
        </Field>
        {stoldGps === true && (
          <div className="follow-up-field">
            <Field label="Specificera stöld-GPS *">
              <input type="text" value={stoldGpsSpec} onChange={e => setStoldGpsSpec(e.target.value)} placeholder="t.ex. Modell, placering" />
            </Field>
          </div>
        )}
      </Card>
      
      {/* UPPKOPPLING Section - only for MB or VW */}
      {showUppkopplingSection && (
        <Card data-error={showFieldErrors && uppkopplingMissing}>
          <SectionHeader title="Uppkoppling" />
          {showMbmeQuestion && (
            <Field label="MBme aktiverad *">
              <div className="grid-2-col">
                <ChoiceButton onClick={() => setMbmeAktiverad(true)} isActive={mbmeAktiverad === true} isSet={mbmeAktiverad !== null}>Ja</ChoiceButton>
                <ChoiceButton onClick={() => setMbmeAktiverad(false)} isActive={mbmeAktiverad === false} isSet={mbmeAktiverad !== null}>Nej</ChoiceButton>
              </div>
            </Field>
          )}
          {showVwConnectQuestion && (
            <Field label="VW Connect aktiverad *">
              <div className="grid-2-col">
                <ChoiceButton onClick={() => setVwConnectAktiverad(true)} isActive={vwConnectAktiverad === true} isSet={vwConnectAktiverad !== null}>Ja</ChoiceButton>
                <ChoiceButton onClick={() => setVwConnectAktiverad(false)} isActive={vwConnectAktiverad === false} isSet={vwConnectAktiverad !== null}>Nej</ChoiceButton>
              </div>
            </Field>
          )}
        </Card>
      )}
      
      {/* VAR ÄR BILEN NU Section */}
      <Card data-error={showFieldErrors && (!platsAktuellOrt || !platsAktuellStation || (locationDiffers && !matarstallningAktuell))}>
        <SectionHeader title="Var är bilen nu?" />
        <div className="grid-2-col">
          <Field label="Ort *">
            <select value={platsAktuellOrt} onChange={e => { setPlatsAktuellOrt(e.target.value); setPlatsAktuellStation(''); }}>
              <option value="">Välj ort</option>
              {ORTER.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Station *">
            <select value={platsAktuellStation} onChange={e => setPlatsAktuellStation(e.target.value)} disabled={!platsAktuellOrt}>
              <option value="">Välj station</option>
              {availableStationsAktuell.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        {locationDiffers && (
          <div data-field="matarstallning-aktuell">
            <Field label="Aktuell mätarställning (km) *">
              <input type="number" value={matarstallningAktuell} onChange={e => setMatarstallningAktuell(e.target.value)} placeholder="12345" />
            </Field>
            {matarstallningError && (
              <p className="error-text" style={{ color: 'var(--color-danger)', marginTop: '0.5rem' }}>
                {matarstallningError}
              </p>
            )}
          </div>
        )}
      </Card>
      
      {/* SALUINFO Section - optional */}
      <Card>
        <SectionHeader title="Saluinfo" />
        <p className="section-note">Frivillig sektion</p>
        <Field label="Saludatum">
          <input type="date" value={saludatum} onChange={e => setSaludatum(e.target.value)} />
        </Field>
        <Field label="Station">
          <select value={saluStation} onChange={e => setSaluStation(e.target.value)}>
            <option value="">Välj station</option>
            {HUVUDSTATIONER.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </Field>
      </Card>
      
      {/* KÖPARE Section - optional */}
      <Card>
        <SectionHeader title="Köpare" />
        <p className="section-note">Frivillig sektion</p>
        <Field label="Köpare (företag)">
          <input type="text" value={kopareForetag} onChange={e => setKopareForetag(e.target.value)} placeholder="Företagsnamn" />
        </Field>
        <Field label="Returort för fordonsförsäljning">
          <input type="text" value={returort} onChange={e => setReturort(e.target.value)} placeholder="Ort" />
        </Field>
        <Field label="Returadress försäljning">
          <input type="text" value={returadress} onChange={e => setReturadress(e.target.value)} placeholder="Adress" />
        </Field>
        <Field label="Attention">
          <input type="text" value={attention} onChange={e => setAttention(e.target.value)} placeholder="Kontaktperson" />
        </Field>
        <Field label="Notering fordonsförsäljning">
          <textarea value={noteringForsaljning} onChange={e => setNoteringForsaljning(e.target.value)} placeholder="Övriga noteringar..." rows={3} />
        </Field>
      </Card>
      
      {/* ÖVRIGT Section */}
      <Card>
        <SectionHeader title="Övrigt" />
        <Field label="Anteckningar (frivilligt)">
          <textarea value={anteckningar} onChange={e => setAnteckningar(e.target.value)} placeholder="Övrig information om bilen..." rows={4} />
        </Field>
      </Card>
      
      {/* KLAR FÖR UTHYRNING Section */}
      <Card data-error={showFieldErrors && klarForUthyrningMissing}>
        <SectionHeader title="Klar för uthyrning" />
        <Field label="Klar för uthyrning? *">
          <div className="grid-2-col">
            <ChoiceButton onClick={() => { setKlarForUthyrning(true); setEjUthyrningsbarAnledning(''); }} isActive={klarForUthyrning === true} isSet={klarForUthyrning !== null}>Ja</ChoiceButton>
            <ChoiceButton onClick={() => setKlarForUthyrning(false)} isActive={klarForUthyrning === false} isSet={klarForUthyrning !== null}>Nej</ChoiceButton>
          </div>
        </Field>
        {klarForUthyrning === false && (
          <Field label="Specificera varför *">
            <textarea value={ejUthyrningsbarAnledning} onChange={e => setEjUthyrningsbarAnledning(e.target.value)} placeholder="Ange anledning..." rows={3} />
          </Field>
        )}
      </Card>
      
      <div className="form-actions">
        <Button onClick={handleCancel} variant="secondary">Avbryt</Button>
        <Button onClick={handleRegisterClick} disabled={isSaving} variant={formIsValid ? 'success' : 'primary'}>
          {isSaving ? 'Sparar...' : (formIsValid ? 'Registrera bil' : 'Visa saknad information')}
        </Button>
      </div>
      <footer className="copyright-footer">&copy; {currentYear} Albarone AB &mdash; Alla rättigheter förbehållna</footer>
    </div>
  );
}

// Sub-components
const Card: React.FC<React.PropsWithChildren<any>> = ({ children, ...props }) => (
  <div className="card" {...props}>{children}</div>
);

const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <div className="section-header"><h2>{title}</h2></div>
);

const SubSectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <div className="sub-section-header"><h3>{title}</h3></div>
);

const Field: React.FC<React.PropsWithChildren<{ label: string }>> = ({ label, children }) => (
  <div className="field"><label>{label}</label>{children}</div>
);

const Button: React.FC<React.PropsWithChildren<{ onClick?: () => void; variant?: string; disabled?: boolean; style?: object; className?: string; }>> = ({ onClick, variant = 'primary', disabled, children, ...props }) => (
  <button onClick={onClick} className={`btn ${variant} ${disabled ? 'disabled' : ''}`} disabled={disabled} {...props}>{children}</button>
);

const ChoiceButton: React.FC<{ onClick: () => void; isActive: boolean; children: React.ReactNode; className?: string; isSet?: boolean; }> = ({ onClick, isActive, children, className, isSet = false }) => {
  let btnClass = 'choice-btn';
  if (className) btnClass += ` ${className}`;
  if (isActive) btnClass += ' active default';
  else if (isSet) btnClass += ' disabled-choice';
  return <button onClick={onClick} className={btnClass}>{children}</button>;
};

const SuccessModal: React.FC<{ firstName: string }> = ({ firstName }) => (
  <>
    <div className="modal-overlay" />
    <div className="modal-content success-modal">
      <div className="success-icon">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{width: '3rem', height: '3rem'}}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15L15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3>Tack {firstName}!</h3>
      <p>Bilregistreringen har sparats.</p>
    </div>
  </>
);

type WarningModalProps = {
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  cancelText?: string;
  confirmText?: string;
};

const WarningModal: React.FC<WarningModalProps> = ({ title, message, onCancel, onConfirm, cancelText = 'Avbryt', confirmText = 'Bekräfta' }) => (
  <>
    <div className="modal-overlay" />
    <div className="modal-content warning-modal">
      <h3>{title}</h3>
      <p>{message}</p>
      <div className="modal-actions">
        <button onClick={onCancel} className="btn secondary">{cancelText}</button>
        <button onClick={onConfirm} className="btn primary">{confirmText}</button>
      </div>
    </div>
  </>
);

type FormSummary = {
  fordon: { regnr: string; bilmarke: string; modell: string };
  mottagning: { ort: string; station: string };
  planeradStation: string;
  status: { matarstallning: string; matarstallningAktuell: string; hjultyp: string | null; hjulTillForvaring: string | null; bransletyp: string | null; vaxel: string | null };
  avtalsvillkor: { serviceintervall: string | null; maxKmManad: string | null; avgiftOverKm: string | null };
  stoldGps: boolean | null;
  stoldGpsSpec: string;
  saludatum: string;
  // Utrustning fields
  antalInsynsskydd: number | null;
  instruktionsbok: boolean | null;
  instruktionsbokForvaringOrt: string;
  instruktionsbokForvaringSpec: string;
  coc: boolean | null;
  cocForvaringOrt: string;
  cocForvaringSpec: string;
  antalNycklar: number | null;
  extranyckelForvaringOrt: string;
  extranyckelForvaringSpec: string;
  antalLaddkablar: number | null;
  laddkablarForvaring: string;
  lasbultarMed: boolean | null;
  dragkrok: boolean | null;
  gummimattor: boolean | null;
  dackkompressor: boolean | null;
  hjulForvaringOrt: string;
  hjulForvaringSpec: string;
  klarForUthyrning: string;
};

type ConfirmationModalProps = {
  summary: FormSummary;
  onCancel: () => void;
  onConfirm: () => void;
};

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ summary, onCancel, onConfirm }) => (
  <>
    <div className="modal-overlay" />
    <div className="modal-content confirmation-modal">
      <h3>Bekräfta registrering</h3>
      <div className="summary-section">
        <h4>Fordon</h4>
        <p><strong>Reg.nr:</strong> {summary.fordon.regnr}</p>
        <p><strong>Bilmärke:</strong> {summary.fordon.bilmarke}</p>
        <p><strong>Modell:</strong> {summary.fordon.modell}</p>
      </div>
      <div className="summary-section">
        <h4>Plats för mottagning</h4>
        <p><strong>Ort:</strong> {summary.mottagning.ort}</p>
        <p><strong>Station:</strong> {summary.mottagning.station}</p>
      </div>
      <div className="summary-section">
        <h4>Planerad station</h4>
        <p>{summary.planeradStation}</p>
      </div>
      <div className="summary-section">
        <h4>Fordonsstatus</h4>
        <p><strong>Mätarställning:</strong> {summary.status.matarstallning} km</p>
        {summary.status.matarstallningAktuell && (
          <p><strong>Aktuell mätarställning:</strong> {summary.status.matarstallningAktuell} km</p>
        )}
        <p><strong>Däcktyp:</strong> {summary.status.hjultyp}</p>
        <p><strong>Hjul till förvaring:</strong> {summary.status.hjulTillForvaring}</p>
        <p><strong>Drivmedel:</strong> {summary.status.bransletyp}</p>
        <p><strong>Växel:</strong> {summary.status.vaxel}</p>
      </div>
      <div className="summary-section">
        <h4>Avtalsvillkor</h4>
        <p><strong>Serviceintervall:</strong> {summary.avtalsvillkor.serviceintervall}</p>
        <p><strong>Max km/månad:</strong> {summary.avtalsvillkor.maxKmManad}</p>
        <p><strong>Avgift över-km:</strong> {summary.avtalsvillkor.avgiftOverKm} kr</p>
      </div>
      <div className="summary-section">
        <h4>Utrustning</h4>
        <p><strong>Antal insynsskydd:</strong> {summary.antalInsynsskydd}</p>
        <p><strong>Instruktionsbok/Manual:</strong> {summary.instruktionsbok ? 'Ja' : 'Nej'}</p>
        {summary.instruktionsbok && summary.instruktionsbokForvaringOrt && (
          <p><strong>Förvaring instruktionsbok:</strong> {summary.instruktionsbokForvaringOrt}, {summary.instruktionsbokForvaringSpec}</p>
        )}
        <p><strong>COC-dokument:</strong> {summary.coc ? 'Ja' : 'Nej'}</p>
        {summary.coc && summary.cocForvaringOrt && (
          <p><strong>Förvaring COC:</strong> {summary.cocForvaringOrt}, {summary.cocForvaringSpec}</p>
        )}
        <p><strong>Antal nycklar:</strong> {summary.antalNycklar}</p>
        {summary.antalNycklar === 2 && summary.extranyckelForvaringOrt && (
          <p><strong>Förvaring extranyckel:</strong> {summary.extranyckelForvaringOrt}, {summary.extranyckelForvaringSpec}</p>
        )}
        {summary.antalLaddkablar !== null && summary.antalLaddkablar > 0 && (
          <>
            <p><strong>Antal laddkablar:</strong> {summary.antalLaddkablar}</p>
            {summary.laddkablarForvaring && <p><strong>Förvaring laddkablar:</strong> {summary.laddkablarForvaring}</p>}
          </>
        )}
        <p><strong>Låsbultar med:</strong> {summary.lasbultarMed ? 'Ja' : 'Nej'}</p>
        <p><strong>Dragkrok:</strong> {summary.dragkrok ? 'Ja' : 'Nej'}</p>
        <p><strong>Gummimattor:</strong> {summary.gummimattor ? 'Ja' : 'Nej'}</p>
        <p><strong>Däckkompressor:</strong> {summary.dackkompressor ? 'Ja' : 'Nej'}</p>
        {summary.status.hjulTillForvaring && summary.status.hjulTillForvaring !== 'Inga medföljande hjul' && (
          <p><strong>Hjul till förvaring:</strong> {summary.status.hjulTillForvaring} - {summary.hjulForvaringOrt}, {summary.hjulForvaringSpec}</p>
        )}
        <p><strong>Stöld-GPS:</strong> {summary.stoldGps ? 'Ja' : 'Nej'}</p>
        {summary.stoldGps && summary.stoldGpsSpec && (
          <p><strong>Stöld-GPS specifikation:</strong> {summary.stoldGpsSpec}</p>
        )}
      </div>
      <div className="summary-section">
        <h4>Klar för uthyrning</h4>
        <p>{summary.klarForUthyrning}</p>
      </div>
      <div className="modal-actions">
        <button onClick={onCancel} className="btn secondary">Avbryt</button>
        <button onClick={onConfirm} className="btn success">Bekräfta</button>
      </div>
    </div>
  </>
);

const SpinnerOverlay = () => (
  <div className="modal-overlay spinner-overlay">
    <div className="spinner"></div>
    <p>Sparar...</p>
  </div>
);

const GlobalStyles: React.FC<{ backgroundUrl: string }> = ({ backgroundUrl }) => (
  <style jsx global>{`
    :root {
      --color-bg: #f8fafc;
      --color-card: #ffffff;
      --color-text: #1f2937;
      --color-text-secondary: #6b7280;
      --color-primary: #2563eb;
      --color-primary-light: #eff6ff;
      --color-success: #16a34a;
      --color-success-light: #f0fdf4;
      --color-danger: #dc2626;
      --color-danger-light: #fef2f2;
      --color-warning: #f59e0b;
      --color-warning-light: #fffbeb;
      --color-border: #e5e7eb;
      --color-border-focus: #3b82f6;
      --color-disabled: #a1a1aa;
      --color-disabled-light: #f4f4f5;
      --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
      --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    }
    .background-img { display: none !important; }
    body::before {
      content: '';
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background-image: url('${backgroundUrl}');
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      opacity: 0.45;
      filter: brightness(0.65);
      z-index: -1;
      pointer-events: none;
    }
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background-color: white; color: var(--color-text); margin:0; padding:0; }
    .nybil-form { max-width:700px; margin:0 auto; padding:1rem; box-sizing:border-box; }
    .main-header { text-align:center; margin-bottom:1.5rem; }
    .main-logo { max-width:188px; height:auto; margin:0 auto 1rem auto; display:block; }
    .user-info { font-weight:500; color:var(--color-text-secondary); margin:0; }
    .card { background-color:rgba(255,255,255,0.92); padding:1.5rem; border-radius:12px; margin-bottom:1.5rem; box-shadow:var(--shadow-md); border:2px solid transparent; transition:border-color .3s; }
    .card[data-error="true"] { border:2px solid var(--color-danger); }
    .field[data-error="true"] input, .field[data-error="true"] select, .field[data-error="true"] textarea { border:2px solid var(--color-danger)!important; }
    .section-header { padding-bottom:.75rem; border-bottom:1px solid var(--color-border); margin-bottom:1.5rem; }
    .section-header h2 { font-size:1.25rem; font-weight:700; color:var(--color-text); text-transform:uppercase; letter-spacing:.05em; margin:0; }
    .sub-section-header { margin-top:2rem; margin-bottom:1rem; }
    .sub-section-header h3 { font-size:1rem; font-weight:600; color:var(--color-text); margin:0; }
    .field { margin-bottom:1rem; }
    .field label { display:block; margin-bottom:.5rem; font-weight:500; font-size:.875rem; }
    .follow-up-field { margin-left:1.5rem; }
    .field input, .field select, .field textarea { width:100%; padding:.75rem; border:1px solid var(--color-border); border-radius:6px; font-size:1rem; background-color:white; box-sizing:border-box; }
    .field input:focus, .field select:focus, .field textarea:focus { outline:2px solid var(--color-border-focus); border-color:transparent; }
    .field select[disabled] { background-color:var(--color-disabled-light); cursor:not-allowed; }
    .reg-input { text-align:center; font-weight:600; letter-spacing:2px; text-transform:uppercase; }
    .grid-2-col { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:1rem; }
    .grid-3-col { display:grid; grid-template-columns:repeat(3,1fr); gap:1rem; }
    .grid-4-col { display:grid; grid-template-columns:repeat(4,1fr); gap:1rem; }
    .grid-5-col { display:grid; grid-template-columns:repeat(5,1fr); gap:1rem; }
    .form-actions { margin-top:2rem; padding-top:1.5rem; border-top:1px solid var(--color-border); display:flex; gap:1rem; justify-content:flex-end; padding-bottom:1.5rem; }
    .copyright-footer { text-align:center; margin-top:2rem; padding:1.5rem 0 3rem 0; color:var(--color-text-secondary); font-size:.875rem; }
    .btn { padding:.75rem 1.5rem; border:none; border-radius:8px; font-weight:600; cursor:pointer; transition:all .2s; }
    .btn.primary { background-color:var(--color-primary); color:white; }
    .btn.secondary { background-color:var(--color-border); color:var(--color-text); }
    .btn.success { background-color:var(--color-success); color:white; }
    .btn.disabled { background-color:var(--color-disabled-light); color:var(--color-disabled); cursor:not-allowed; }
    .btn:not(:disabled):hover { filter:brightness(1.1); }
    .choice-btn { display:flex; align-items:center; justify-content:center; width:100%; min-width:0; padding:.85rem 1rem; border-radius:8px; border:2px solid var(--color-border); background-color:white; color:var(--color-text); font-weight:600; font-size:1rem; cursor:pointer; transition:all .2s; box-sizing:border-box; }
    .choice-btn:hover { filter:brightness(1.05); }
    .choice-btn.active.default { border-color:var(--color-success); background-color:var(--color-success-light); color:var(--color-success); }
    .choice-btn.disabled-choice { border-color:var(--color-border); background-color:var(--color-bg); color:var(--color-disabled); cursor:default; }
    .choice-btn.full-width-choice { width:100%; }
    .media-section { display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-top:1rem; }
    .media-label { display:block; text-align:center; padding:1.5rem 1rem; border:2px dashed; border-radius:8px; cursor:pointer; transition:all .2s; font-weight:600; }
    .media-label:hover { filter:brightness(.95); }
    .media-label.active { border-style:solid; border-color:var(--color-success); background-color:var(--color-success-light); color:var(--color-success); }
    .media-label.mandatory { border-color:var(--color-danger); background-color:var(--color-danger-light); color:var(--color-danger); }
    .media-label.optional { border-color:var(--color-warning); background-color:var(--color-warning-light); color:#92400e; }
    .media-previews { display:flex; flex-wrap:wrap; gap:.5rem; margin-top:1rem; }
    .media-btn { position:relative; width:70px; height:70px; border-radius:8px; overflow:hidden; background-color:var(--color-border); }
    .media-btn img { width:100%; height:100%; object-fit:cover; }
    .remove-media-btn { position:absolute; top:2px; right:2px; width:22px; height:22px; border-radius:50%; background-color:var(--color-danger); color:white; border:2px solid white; cursor:pointer; font-size:1rem; font-weight:bold; line-height:1; padding:0; }
    .remove-media-btn:hover { background-color:#b91c1c; }
    .modal-overlay { position:fixed; top:0; left:0; right:0; bottom:0; background-color:rgba(0,0,0,0.5); z-index:100; }
    .modal-content { position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background-color:rgba(255,255,255,0.98); padding:2rem; border-radius:12px; z-index:101; box-shadow:var(--shadow-md); width:90%; max-width:600px; max-height:90vh; overflow-y:auto; -webkit-overflow-scrolling:touch; }
    .success-modal { text-align:center; }
    .success-icon { font-size:3rem; color:var(--color-success); margin-bottom:1rem; }
    .warning-modal h3 { margin-top:0; color:var(--color-warning); }
    .warning-modal p { margin-bottom:1.5rem; }
    .confirmation-modal h3 { margin-top:0; color:var(--color-primary); border-bottom:1px solid var(--color-border); padding-bottom:0.75rem; }
    .confirmation-modal .summary-section { margin-bottom:1rem; padding:0.75rem; background-color:var(--color-bg); border-radius:6px; }
    .confirmation-modal .summary-section h4 { margin:0 0 0.5rem 0; font-size:0.9rem; color:var(--color-text-secondary); text-transform:uppercase; letter-spacing:0.05em; }
    .confirmation-modal .summary-section p { margin:0.25rem 0; font-size:0.9rem; }
    .confirmation-modal .summary-section strong { color:var(--color-text); }
    .modal-actions { display:flex; gap:1rem; justify-content:flex-end; margin-top:1.5rem; padding-top:1rem; border-top:1px solid var(--color-border); }
    .section-note { font-size:0.85rem; color:var(--color-text-secondary); font-style:italic; margin:-0.5rem 0 1rem 0; }
    .spinner-overlay { display:flex; flex-direction:column; align-items:center; justify-content:center; color:white; font-size:1.2rem; font-weight:600; }
    .spinner { border:5px solid #f3f3f3; border-top:5px solid var(--color-primary); border-radius:50%; width:50px; height:50px; animation:spin 1s linear infinite; margin-bottom:1rem; }
    @keyframes spin { 0% { transform:rotate(0deg); } 100% { transform:rotate(360deg); } }
    @media (max-width:480px) { .grid-2-col { grid-template-columns:1fr; } .grid-3-col { grid-template-columns:1fr; } .grid-4-col { grid-template-columns:repeat(2,1fr); } .grid-5-col { grid-template-columns:repeat(2,1fr); } }
  `}</style>
);