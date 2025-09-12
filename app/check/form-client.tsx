import React from 'react';

// Dummy-data för bilinfo, byt ut mot din riktiga datakälla när du vill
const carData = [
  { damage: "Buckla vänster dörr" },
  { damage: "Repa höger framskärm" }
];

export default function FormClient() {
  return (
    <div>
      {/* Bilinfo med ALLA befintliga skador */}
      {carData.length > 0 && (
        <div style={{
          marginTop: '20px',
          padding: '20px',
          backgroundColor: '#f0f9ff',
          borderRadius: '8px',
          border: '1px solid #bdfbfe'
        }}>
          <h3>Bilinfo med ALLA befintliga skador</h3>
          {carData.map((car, idx) => (
            <div key={idx}>
              <p>Skada: {car.damage}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}