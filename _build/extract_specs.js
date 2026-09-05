const fs = require('fs');
const path = require('path');

// Configuration for each brand
const brands = [
  {
    brand: 'Mazda',
    make: 'mazda',
    file: 'mazda',
    models: [
      { name: 'Mazda3', slug: 'mazda3' },
      { name: 'CX-30', slug: 'cx_30' },
      { name: 'CX-5', slug: 'cx_5' },
      { name: 'CX-50', slug: 'cx_50' },
      { name: 'CX-70', slug: 'cx_70' },
      { name: 'CX-90', slug: 'cx_90' },
      { name: 'MX-5 Miata', slug: 'mx_5_miata' }
    ]
  },
  {
    brand: 'Mitsubishi',
    make: 'mitsubishi',
    file: 'mitsubishi',
    models: [
      { name: 'Outlander Sport', slug: 'outlander_sport' },
      { name: 'Eclipse Cross', slug: 'eclipse_cross' },
      { name: 'Outlander', slug: 'outlander' },
      { name: 'Outlander PHEV', slug: 'outlander_phev' }
    ]
  },
  {
    brand: 'Volkswagen',
    make: 'volkswagen',
    file: 'volkswagen',
    models: [
      { name: 'Jetta', slug: 'jetta' },
      { name: 'Jetta GLI', slug: 'jetta_gli' },
      { name: 'Golf GTI', slug: 'golf_gti' },
      { name: 'Golf R', slug: 'golf_r' },
      { name: 'Taos', slug: 'taos' },
      { name: 'Tiguan', slug: 'tiguan' },
      { name: 'Atlas', slug: 'atlas' },
      { name: 'Atlas Cross Sport', slug: 'atlas_cross_sport' },
      { name: 'ID.4', slug: 'id_4' }
    ]
  }
];

// Function to extract specs from page HTML
function extractSpecs(html, brand, modelName) {
  const specs = {
    brand: brand,
    model: modelName,
    status: 'parsed',
    year: 2026
  };

  try {
    // Extract trim from "Showing the 2026 ..." text
    const trimMatch = html.match(/Showing the 2026 [^\n]+ ([\w\s.]+?)(?:\s+(?:FWD|AWD|RWD))?$/m);
    if (trimMatch) {
      specs.trim = trimMatch[1].trim();
    }

    // Extract MSRP
    const msrpMatch = html.match(/\$?([\d,]+)\s*(?:Starting MSRP|Current listing price)/);
    if (msrpMatch) {
      specs.msrp = parseInt(msrpMatch[1].replace(/,/g, ''));
    }

    // Extract Engine Type
    const engineMatch = html.match(/Regular Gasoline I-\d+|Gasoline I-\d+|Diesel I-\d+|Electric|Hybrid|[\d.]+-?liter/);
    if (engineMatch) {
      specs.engine = engineMatch[0];
    }

    // Extract MPG City/Hwy
    const mpgMatch = html.match(/([\d.]+)\s+City\s+\/\s+([\d.]+)\s+Hwy/);
    if (mpgMatch) {
      specs.mpgCity = parseInt(mpgMatch[1]);
      specs.mpgHwy = parseInt(mpgMatch[2]);
    }

    // Extract combined MPG
    const combinedMatch = html.match(/([\d.]+)\s+combined MPG/);
    if (combinedMatch) {
      specs.mpgCombined = parseInt(combinedMatch[1]);
    }

    // Extract Horsepower (look for "SAE Net Horsepower @ RPM" pattern)
    const hpMatch = html.match(/SAE Net Horsepower @ RPM[\s\S]*?([\d.]+)\s+@/);
    if (hpMatch) {
      specs.horsepower = parseInt(hpMatch[1]);
    } else {
      // Fallback: look for any "XXX hp" pattern
      const hpMatch2 = html.match(/([\d.]+)\s+hp/);
      if (hpMatch2) {
        specs.horsepower = parseInt(hpMatch2[1]);
      }
    }

    // Extract Torque (look for "SAE Net Torque @ RPM" pattern)
    const torqueMatch = html.match(/SAE Net Torque @ RPM[\s\S]*?([\d.]+)\s+@/);
    if (torqueMatch) {
      specs.torque = parseInt(torqueMatch[1]);
    } else {
      // Fallback: look for any "XXX lb-ft" pattern
      const torqueMatch2 = html.match(/([\d.]+)\s+lb-ft/);
      if (torqueMatch2) {
        specs.torque = parseInt(torqueMatch2[1]);
      }
    }

    // Extract cargo volumes
    const cargo1Match = html.match(/Cargo Volume to Seat 1[\s\S]*?([\d.]+)\s*ft/);
    if (cargo1Match) {
      specs.cargo1 = parseFloat(cargo1Match[1]);
    }

    const cargo2Match = html.match(/Cargo Volume to Seat 2[\s\S]*?([\d.]+)\s*ft/);
    if (cargo2Match) {
      specs.cargo2 = parseFloat(cargo2Match[1]);
    }

    const cargo3Match = html.match(/Cargo Volume to Seat 3[\s\S]*?([\d.]+)\s*ft/);
    if (cargo3Match) {
      specs.cargo3 = parseFloat(cargo3Match[1]);
    }

    // Extract Passenger Volume
    const passengerMatch = html.match(/Passenger Volume[\s\S]*?([\d.]+)\s*ft/);
    if (passengerMatch) {
      specs.passengerVolume = parseFloat(passengerMatch[1]);
    }

    // Extract Payload Capacity
    const payloadMatch = html.match(/Maximum Payload Capacity[\s\S]*?([\d,]+)/);
    if (payloadMatch) {
      specs.payload = parseInt(payloadMatch[1].replace(/,/g, ''));
    }

    // Extract Towing Capacity
    const towingMatch = html.match(/Maximum Trailering Capacity[\s\S]*?([\d,]+)/);
    if (towingMatch) {
      specs.towing = parseInt(towingMatch[1].replace(/,/g, ''));
    }

    // Extract Packages (simplified - just look for package names)
    specs.packages = [];

    // Add src field
    specs.src = `cars.com 2026 ${brand} ${modelName} specs`;

  } catch (e) {
    specs.status = 'error';
    specs.error = e.message;
  }

  return specs;
}

module.exports = { brands, extractSpecs };
