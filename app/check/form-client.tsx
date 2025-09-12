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