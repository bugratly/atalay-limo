const RAW_VEHICLE_CATALOG = [
  ['Audi','A6',false], ['Audi','A6 Avant',false], ['Audi','A7',false], ['Audi','A8',false], ['Audi','A8 L',false], ['Audi','e-tron',false], ['Audi','Q4 e-tron',false], ['Audi','Q5',false], ['Audi','Q7',false], ['Audi','Q8',false], ['Audi','Q8 e-tron',false], ['Audi','RS 6',false], ['Audi','RS 7',false], ['Audi','S6',false], ['Audi','S7',false], ['Audi','S8',false], ['Audi','SQ5',false], ['Audi','SQ7',false], ['Audi','SQ8',false],
  ['Bentley','Bentayga',false], ['Bentley','Flying Spur',false], ['Bentley','Mulsanne',false],
  ['BMW','5-Series',false], ['BMW','5-Series 530e',false], ['BMW','7-Series',false], ['BMW','7-Series 745e',false], ['BMW','740i',false], ['BMW','750',false], ['BMW','Alpina B7',false], ['BMW','i5',false], ['BMW','i7',false], ['BMW','iX',false], ['BMW','X3',false], ['BMW','X5',false], ['BMW','X6',false], ['BMW','X7',false],
  ['Cadillac','CT6',false], ['Cadillac','Escalade',true], ['Cadillac','Escalade ESV',true], ['Cadillac','Escalade IQ',true], ['Cadillac','LYRIQ',false], ['Cadillac','Optiq',false], ['Cadillac','Vistiq',true], ['Cadillac','XT5',false], ['Cadillac','XT6',false], ['Cadillac','XTS',false],
  ['Chevrolet','Suburban',true], ['Chevrolet','Tahoe',true],
  ['Ford','Expedition',true], ['Ford','Expedition Max',true], ['Ford','Expedition MAX XLT',true],
  ['Genesis','G90',false], ['Genesis','GV60',false], ['Genesis','GV70',false], ['Genesis','GV80',false],
  ['GMC','Suburban',false], ['GMC','Yukon',true], ['GMC','Yukon Denali',true], ['GMC','Yukon XL',true], ['GMC','Yukon XL Denali',true],
  ['Infiniti','QX80',true],
  ['Jaguar','F-PACE',false], ['Jaguar','XJ',false],
  ['Jeep','Grand Wagoneer',true], ['Jeep','Wagoneer',true],
  ['Kia','EV9',true],
  ['Lamborghini','Urus',false],
  ['Land Rover','Defender',false], ['Land Rover','Range Rover',false], ['Land Rover','Range Rover Sport',false], ['Land Rover','Range Rover Velar',false],
  ['Lexus','GS',false], ['Lexus','GS Hybrid',false], ['Lexus','GX',false], ['Lexus','LS',false], ['Lexus','LX',false], ['Lexus','TX',false], ['Lexus','TX 350',false], ['Lexus','TX 500h',true],
  ['Lincoln','Aviator',false], ['Lincoln','Continental',false], ['Lincoln','Corsair',false], ['Lincoln','MKT',true], ['Lincoln','Nautilus',false], ['Lincoln','Navigator',true], ['Lincoln','Navigator L',true],
  ['Lucid','Air',false], ['Lucid','Air Pure',false], ['Lucid','Air Touring',false],
  ['Maserati','Levante',false], ['Maserati','Quattroporte',false],
  ['Mercedes-Benz','E-Class',false], ['Mercedes-Benz','E350e',false], ['Mercedes-Benz','EQB',false], ['Mercedes-Benz','EQE',false], ['Mercedes-Benz','EQE SUV',false], ['Mercedes-Benz','EQS',false], ['Mercedes-Benz','EQS SUV',false], ['Mercedes-Benz','G-Class',false], ['Mercedes-Benz','GL-Class',true], ['Mercedes-Benz','GLC Coupe',false], ['Mercedes-Benz','GLC-Class',false], ['Mercedes-Benz','GLE Coupe',false], ['Mercedes-Benz','GLE-Class',false], ['Mercedes-Benz','GLS SUV',true], ['Mercedes-Benz','GLS-Class',false], ['Mercedes-Benz','S-Class',false],
  ['Porsche','Cayenne',false], ['Porsche','Cayenne Coupe',false], ['Porsche','Panamera',false], ['Porsche','Taycan',false],
  ['Rivian','R1S',true],
  ['Rolls-Royce','Cullinan',false], ['Rolls-Royce','Flying Spur',false], ['Rolls-Royce','Ghost',false], ['Rolls-Royce','Phantom',false],
  ['Tesla','Model S',false], ['Tesla','Model X',false],
  ['Volvo','S90',false], ['Volvo','S90 Hybrid',false], ['Volvo','XC60',false], ['Volvo','XC60 Hybrid',false], ['Volvo','XC90',false], ['Volvo','XC90 Hybrid',false],
];

export const VEHICLE_MIN_YEAR_US = 2018;

export const VEHICLE_CATALOG = RAW_VEHICLE_CATALOG.map(([make, model, suvEligible]) => ({
  make,
  model,
  suvEligible: Boolean(suvEligible),
  minYearUS: VEHICLE_MIN_YEAR_US,
}));

export function normalizeVehicleText(value = '') {
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getMakeOptions() {
  const makes = [...new Set(VEHICLE_CATALOG.map((v) => v.make))].sort((a, b) => a.localeCompare(b));
  return [...makes, 'Other'];
}

export function getModelsForMake(make) {
  const normalizedMake = normalizeVehicleText(make);
  if (!normalizedMake || normalizedMake === 'other') return [];
  return VEHICLE_CATALOG
    .filter((v) => normalizeVehicleText(v.make) === normalizedMake)
    .map((v) => v.model)
    .sort((a, b) => a.localeCompare(b));
}

export function getVehicleCatalogMatch(make, model) {
  const normalizedMake = normalizeVehicleText(make);
  const normalizedModel = normalizeVehicleText(model);
  return VEHICLE_CATALOG.find((v) => normalizeVehicleText(v.make) === normalizedMake && normalizeVehicleText(v.model) === normalizedModel) || null;
}

export function inferVehicleTypeFromCatalog(vehicle) {
  if (!vehicle) return null;
  return vehicle.suvEligible ? 'SUV' : 'Luxury';
}
