import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import API_BASE from '../apiBase';
import { getApiErrorMessage } from '../utils/apiMessages';
import {
  clearSessionProfileCache,
  fetchSessionProfile,
  fetchTgcCatalog,
  setSessionProfileCache,
} from '../utils/bootstrapCache';

const ROLE_OPTIONS = [
  { value: 'player', label: 'Jugador' },
  { value: 'trader', label: 'Trader' },
  { value: 'store-owner', label: 'Tienda' },
  { value: 'organizer', label: 'Organizador' },
  { value: 'admin', label: 'Admin' },
];

function Settings() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [profile, setProfile] = useState({
    username: '',
    email: '',
    display_name: '',
    role: 'player',
    bio: '',
    advanced_mode: false,
    favorite_tgc_id: '',
    default_tgc_id: '',
  });
  const [users, setUsers] = useState([]);
  const [tgcs, setTgcs] = useState([]);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [updatingRoleUserId, setUpdatingRoleUserId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [settingsData, tgcList] = await Promise.all([
          fetchSessionProfile(
            () => axios.get(`${API_BASE}/settings/me`).then((response) => response.data || {}),
            { forceRefresh: false }
          ),
          fetchTgcCatalog(
            () => axios.get(`${API_BASE}/tgc`).then((response) => (
              Array.isArray(response.data) ? response.data : []
            )),
            { forceRefresh: false }
          ),
        ]);

        const data = settingsData || {};
        setProfile({
          username: data.username || '',
          email: data.email || '',
          display_name: data.display_name || '',
          role: data.role || 'player',
          bio: data.bio || '',
          advanced_mode: Boolean(data.advanced_mode),
          favorite_tgc_id: data.favorite_tgc_id || '',
          default_tgc_id: data.default_tgc_id || '',
        });
        setTgcs(Array.isArray(tgcList) ? tgcList : []);

        if ((data.role || 'player') === 'admin') {
          const usersRes = await axios.get(`${API_BASE}/settings/users`);
          setUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
        }
      } catch (error) {
        if (error.response?.status === 401) {
          navigate('/');
          return;
        }

        showToast({
          type: 'error',
          message: getApiErrorMessage(error, 'No se pudo cargar la configuracion.'),
        });
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [navigate, showToast]);

  const updateField = (field, value) => {
    setProfile((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);

    try {
      const payload = {
        display_name: profile.display_name,
        bio: profile.bio,
        advanced_mode: Boolean(profile.advanced_mode),
        favorite_tgc_id: profile.favorite_tgc_id ? Number(profile.favorite_tgc_id) : null,
        default_tgc_id: profile.default_tgc_id ? Number(profile.default_tgc_id) : null,
      };

      const response = await axios.patch(`${API_BASE}/settings/me`, payload);
      const data = response.data || {};
      setSessionProfileCache(data);
      setProfile((current) => ({
        ...current,
        display_name: data.display_name || '',
        role: data.role || 'player',
        bio: data.bio || '',
        advanced_mode: Boolean(data.advanced_mode),
        favorite_tgc_id: data.favorite_tgc_id || '',
        default_tgc_id: data.default_tgc_id || '',
      }));
      showToast({ type: 'success', message: 'Configuracion guardada.' });
    } catch (error) {
      if (error.response?.status === 401) {
        navigate('/');
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo guardar la configuracion.'),
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setSavingPassword(true);

    try {
      await axios.post(`${API_BASE}/settings/password`, {
        old_password: oldPassword,
        new_password: newPassword,
      });
      setOldPassword('');
      setNewPassword('');
      showToast({ type: 'success', message: 'Contrasena actualizada.' });
    } catch (error) {
      if (error.response?.status === 401) {
        navigate('/');
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo cambiar la contrasena.'),
      });
    } finally {
      setSavingPassword(false);
    }
  };

  const updateUserRole = async (userId, role) => {
    setUpdatingRoleUserId(userId);

    try {
      const response = await axios.patch(`${API_BASE}/settings/users/${userId}/role`, { role });
      const updatedUser = response.data;
      setUsers((current) =>
        current.map((user) => (user.id === userId ? updatedUser : user))
      );
      showToast({ type: 'success', message: 'Rol actualizado.' });
    } catch (error) {
      if (error.response?.status === 401) {
        navigate('/');
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo actualizar el rol.'),
      });
    } finally {
      setUpdatingRoleUserId(null);
    }
  };

  const deleteAccount = async () => {
    const confirmed = window.confirm(
      'Se borrara tu cuenta, tu coleccion y tus mazos. Esta accion no se puede deshacer.'
    );

    if (!confirmed) {
      return;
    }

    if (!deletePassword) {
      showToast({ type: 'error', message: 'Introduce tu contrasena para borrar la cuenta.' });
      return;
    }

    setDeletingAccount(true);

    try {
      await axios.delete(`${API_BASE}/settings/me`, {
        data: { password: deletePassword },
      });
      await axios.post(`${API_BASE}/auth/logout`).catch(() => undefined);
      clearSessionProfileCache();
      navigate('/');
      window.location.reload();
    } catch (error) {
      if (error.response?.status === 401) {
        navigate('/');
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo borrar la cuenta.'),
      });
    } finally {
      setDeletingAccount(false);
    }
  };

  if (loading) {
    return (
      <div className="settings page-shell">
        <section className="page-hero">
          <div>
            <span className="eyebrow">Perfil</span>
            <h1>Configuracion</h1>
            <p>Cargando tu perfil y tus preferencias...</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="settings page-shell">
      <section className="page-hero">
        <div>
          <span className="eyebrow">Perfil</span>
          <h1>Configuracion</h1>
          <p>
            Ajusta tu rol, tu presentacion y tus preferencias principales sin salir de
            la cuenta actual.
          </p>
        </div>
      </section>

      <section className="settings-grid">
        <form onSubmit={saveProfile} className="panel settings-panel">
          <div className="settings-panel-header">
            <h2>Perfil y preferencias</h2>
            <p>Estos ajustes se guardan en tu cuenta.</p>
          </div>

          <div className="settings-form-grid">
            <label className="settings-field">
              <span>Usuario</span>
              <input type="text" value={profile.username} disabled />
            </label>

            <label className="settings-field">
              <span>Email</span>
              <input type="email" value={profile.email} disabled />
            </label>

            <label className="settings-field">
              <span>Nombre visible</span>
              <input
                type="text"
                value={profile.display_name}
                onChange={(e) => updateField('display_name', e.target.value)}
                maxLength={100}
              />
            </label>

            <label className="settings-field">
              <span>Rol</span>
              <input type="text" value={ROLE_OPTIONS.find((option) => option.value === profile.role)?.label || profile.role} disabled />
            </label>

            <div className="settings-field settings-switch-field">
              <span>Ajustes avanzados</span>
              <label className="settings-switch">
                <input
                  type="checkbox"
                  checked={Boolean(profile.advanced_mode)}
                  onChange={(e) => updateField('advanced_mode', e.target.checked)}
                />
                <span className="settings-switch-slider" />
                <strong>{profile.advanced_mode ? 'Activados' : 'Desactivados'}</strong>
              </label>
              <small>
                Permite marcar copias como faltantes directamente dentro del mazo sin tocar tu colección.
              </small>
            </div>

            <label className="settings-field">
              <span>TCG favorito</span>
              <select
                value={profile.favorite_tgc_id}
                onChange={(e) => updateField('favorite_tgc_id', e.target.value)}
              >
                <option value="">Sin preferencia</option>
                {tgcs.map((tgc) => (
                  <option key={tgc.id} value={tgc.id}>
                    {tgc.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="settings-field">
              <span>TCG por defecto</span>
              <select
                value={profile.default_tgc_id}
                onChange={(e) => updateField('default_tgc_id', e.target.value)}
              >
                <option value="">Sin preferencia</option>
                {tgcs.map((tgc) => (
                  <option key={tgc.id} value={tgc.id}>
                    {tgc.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="settings-field settings-field-full">
              <span>Bio</span>
              <textarea
                value={profile.bio}
                onChange={(e) => updateField('bio', e.target.value)}
                rows={4}
                maxLength={500}
                placeholder="Cuéntanos qué juegas, coleccionas o gestionas."
              />
            </label>
          </div>

          <div className="settings-actions">
            <button type="submit" disabled={savingProfile}>
              {savingProfile ? 'Guardando...' : 'Guardar configuracion'}
            </button>
          </div>
        </form>

        <form onSubmit={changePassword} className="panel settings-panel">
          <div className="settings-panel-header">
            <h2>Seguridad</h2>
            <p>Cambia tu contrasena cuando lo necesites.</p>
          </div>

          <div className="settings-form-grid">
            <label className="settings-field settings-field-full">
              <span>Contrasena actual</span>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                required
              />
            </label>

            <label className="settings-field settings-field-full">
              <span>Nueva contrasena</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
              />
            </label>
          </div>

          <div className="settings-actions">
            <button type="submit" disabled={savingPassword}>
              {savingPassword ? 'Actualizando...' : 'Cambiar contrasena'}
            </button>
          </div>
        </form>

        <section className="panel settings-panel settings-danger-panel">
          <div className="settings-panel-header">
            <h2>Zona peligrosa</h2>
            <p>Borra tu cuenta, tu coleccion y tus mazos de forma permanente.</p>
          </div>

          <div className="settings-form-grid">
            <label className="settings-field settings-field-full">
              <span>Confirma con tu contrasena</span>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Introduce tu contrasena actual"
              />
            </label>
          </div>

          <div className="settings-actions">
            <button
              type="button"
              className="settings-danger-button"
              onClick={deleteAccount}
              disabled={deletingAccount}
            >
              {deletingAccount ? 'Borrando cuenta...' : 'Borrar cuenta'}
            </button>
          </div>
        </section>

        {profile.role === 'admin' && (
          <section className="panel settings-panel settings-admin-panel">
            <div className="settings-panel-header">
              <h2>Administracion</h2>
              <p>Solo los administradores pueden ver y cambiar los roles de otros usuarios.</p>
            </div>

            <div className="settings-admin-list">
              {users.map((user) => (
                <article key={user.id} className="settings-admin-user">
                  <div className="settings-admin-user-copy">
                    <strong>{user.display_name || user.username}</strong>
                    <span>@{user.username}</span>
                    <span>{user.email}</span>
                  </div>

                  <div className="settings-admin-role">
                    <select
                      value={user.role || 'player'}
                      onChange={(e) => updateUserRole(user.id, e.target.value)}
                      disabled={updatingRoleUserId === user.id}
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </section>
    </div>
  );
}

export default Settings;
