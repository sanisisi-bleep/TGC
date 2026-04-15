import React, { useState } from 'react';

function Settings() {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const changePassword = async (e) => {
    e.preventDefault();
    try {
      // Asumir endpoint para cambiar contraseña, pero no implementado aún
      alert('Funcionalidad no implementada aún');
    } catch (err) {
      alert('Error al cambiar contraseña');
    }
  };

  return (
    <div className="settings">
      <h1>Configuración</h1>
      <form onSubmit={changePassword} className="password-form">
        <h2>Cambiar Contraseña</h2>
        <input
          type="password"
          placeholder="Contraseña actual"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Nueva contraseña"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
        <button type="submit">Cambiar Contraseña</button>
      </form>
    </div>
  );
}

export default Settings;