import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { isUnauthorizedError, useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import useBrowserStorageState from '../hooks/useBrowserStorageState';
import useQueryErrorToast from '../hooks/useQueryErrorToast';
import { getApiErrorMessage } from '../utils/apiMessages';
import queryKeys from '../queryKeys';
import {
  changePassword as changePasswordRequest,
  deleteAccount as deleteAccountRequest,
  getAdminUsers,
  getTgcCatalog,
  sendFeedback as sendFeedbackRequest,
  updateAdminUserRole,
  updateProfile,
} from '../services/api';

const ROLE_OPTIONS = [
  { value: 'player', label: 'Jugador' },
  { value: 'trader', label: 'Trader' },
  { value: 'store-owner', label: 'Tienda' },
  { value: 'organizer', label: 'Organizador' },
  { value: 'admin', label: 'Admin' },
];

const FEEDBACK_STORAGE_KEY = 'tgc-feedback-draft-v1';
const FEEDBACK_CATEGORIES = [
  { value: 'idea', label: 'Idea o mejora' },
  { value: 'ux', label: 'Interfaz o usabilidad' },
  { value: 'data', label: 'Datos, cartas o sets' },
  { value: 'bug', label: 'Error o comportamiento raro' },
  { value: 'other', label: 'Otro tema' },
];

const DEFAULT_FEEDBACK_DRAFT = {
  category: 'idea',
  subject: '',
  message: '',
  allowContact: true,
};
const FEEDBACK_MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const FEEDBACK_ATTACHMENT_ACCEPT = 'image/*,video/*,audio/*';

const readFeedbackDraft = () => {
  if (typeof window === 'undefined') {
    return DEFAULT_FEEDBACK_DRAFT;
  }

  try {
    const rawDraft = window.localStorage.getItem(FEEDBACK_STORAGE_KEY);
    if (!rawDraft) {
      return DEFAULT_FEEDBACK_DRAFT;
    }

    const parsedDraft = JSON.parse(rawDraft);
    return {
      ...DEFAULT_FEEDBACK_DRAFT,
      ...(parsedDraft || {}),
      allowContact: Boolean(parsedDraft?.allowContact),
    };
  } catch (_error) {
    return DEFAULT_FEEDBACK_DRAFT;
  }
};

const formatFeedbackAttachmentSize = (size) => {
  if (!Number.isFinite(size) || size <= 0) {
    return '0 B';
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
};

const isSupportedFeedbackAttachment = (file) => {
  const normalizedType = String(file?.type || '').toLowerCase();
  return (
    normalizedType.startsWith('image/') ||
    normalizedType.startsWith('video/') ||
    normalizedType.startsWith('audio/')
  );
};

const buildFeedbackPreview = (draft, profile, attachment) => {
  const categoryLabel = FEEDBACK_CATEGORIES.find((item) => item.value === draft.category)?.label || 'General';
  const authorName = profile.display_name || profile.username || 'Usuario sin nombre visible';
  const lines = [
    'Buzon de sugerencias - Multiverse TCG Manager',
    `Categoria: ${categoryLabel}`,
    `Asunto: ${draft.subject.trim() || 'Sin asunto'}`,
    draft.allowContact ? `Contacto: ${authorName} (${profile.email || 'sin email'})` : 'Contacto: no mostrar datos personales',
    attachment
      ? `Adjunto: ${attachment.name} (${formatFeedbackAttachmentSize(attachment.size)})`
      : 'Adjunto: ninguno',
    '',
    'Mensaje:',
    draft.message.trim() || 'Sin detalles todavia.',
  ];

  return lines.join('\n');
};

const copyTextToClipboard = async (text) => {
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'absolute';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand('copy');
  document.body.removeChild(textArea);
};

function Settings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const {
    authReady,
    clearProtectedQueryData,
    profile: sessionProfile,
  } = useSession();
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
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [feedbackDraft, setFeedbackDraft] = useBrowserStorageState(
    FEEDBACK_STORAGE_KEY,
    readFeedbackDraft,
    {
      validate: (value) => ({
        ...DEFAULT_FEEDBACK_DRAFT,
        ...(value || {}),
        allowContact: Boolean(value?.allowContact),
      }),
    }
  );
  const [feedbackAttachment, setFeedbackAttachment] = useState(null);
  const feedbackFileInputRef = useRef(null);

  const tgcCatalogQuery = useQuery({
    queryKey: queryKeys.tgcCatalog(),
    queryFn: getTgcCatalog,
    staleTime: 30 * 60 * 1000,
  });
  const adminUsersQuery = useQuery({
    queryKey: queryKeys.adminUsers(),
    queryFn: getAdminUsers,
    enabled: (sessionProfile?.role || 'player') === 'admin',
  });

  const tgcs = tgcCatalogQuery.data || [];
  const users = adminUsersQuery.data || [];
  const loading = !authReady || tgcCatalogQuery.isPending;
  const feedbackPreview = useMemo(
    () => buildFeedbackPreview(feedbackDraft, profile, feedbackAttachment),
    [feedbackAttachment, feedbackDraft, profile]
  );
  const hasFeedbackPayload = Boolean(
    feedbackDraft.subject.trim() ||
    feedbackDraft.message.trim() ||
    feedbackAttachment
  );

  useEffect(() => {
    const data = sessionProfile;
    if (!data) {
      return;
    }

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
  }, [sessionProfile]);

  useEffect(() => {
    if (authReady && !sessionProfile) {
      navigate('/');
    }
  }, [authReady, navigate, sessionProfile]);

  const settingsQueryErrors = useMemo(
    () => [tgcCatalogQuery.error, adminUsersQuery.error],
    [adminUsersQuery.error, tgcCatalogQuery.error]
  );

  useQueryErrorToast(settingsQueryErrors, showToast, 'No se pudo cargar la configuracion.');

  const saveProfileMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.sessionProfile(), data);
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
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo guardar la configuracion.'),
      });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: changePasswordRequest,
    onSuccess: () => {
      setOldPassword('');
      setNewPassword('');
      showToast({ type: 'success', message: 'Contrasena actualizada.' });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo cambiar la contrasena.'),
      });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }) => updateAdminUserRole(userId, role),
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(queryKeys.adminUsers(), (current) => (
        Array.isArray(current)
          ? current.map((user) => (user.id === updatedUser.id ? updatedUser : user))
          : current
      ));
      showToast({ type: 'success', message: 'Rol actualizado.' });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo actualizar el rol.'),
      });
    },
  });

  const sendFeedbackMutation = useMutation({
    mutationFn: sendFeedbackRequest,
    onSuccess: () => {
      setFeedbackDraft(DEFAULT_FEEDBACK_DRAFT);
      setFeedbackAttachment(null);

      if (feedbackFileInputRef.current) {
        feedbackFileInputRef.current.value = '';
      }

      try {
        window.localStorage.removeItem(FEEDBACK_STORAGE_KEY);
      } catch (_error) {
        // Ignore storage issues and keep the local state cleared in memory.
      }

      showToast({
        type: 'success',
        message: 'Sugerencia enviada a multiversetgc@gmail.com.',
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo enviar la sugerencia.'),
      });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: deleteAccountRequest,
    onSuccess: () => {
      clearProtectedQueryData();
      navigate('/');
      showToast({ type: 'success', message: 'Cuenta borrada.' });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo borrar la cuenta.'),
      });
    },
  });

  const updateField = (field, value) => {
    setProfile((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateFeedbackField = (field, value) => {
    setFeedbackDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const clearFeedbackAttachment = () => {
    setFeedbackAttachment(null);
    if (feedbackFileInputRef.current) {
      feedbackFileInputRef.current.value = '';
    }
  };

  const handleFeedbackAttachmentChange = (event) => {
    const nextFile = event.target.files?.[0] || null;

    if (!nextFile) {
      setFeedbackAttachment(null);
      return;
    }

    if (!isSupportedFeedbackAttachment(nextFile)) {
      clearFeedbackAttachment();
      showToast({
        type: 'error',
        message: 'Solo se permiten archivos multimedia de imagen, video o audio.',
      });
      return;
    }

    if (nextFile.size > FEEDBACK_MAX_ATTACHMENT_BYTES) {
      clearFeedbackAttachment();
      showToast({
        type: 'error',
        message: 'El archivo supera el limite de 5 MB.',
      });
      return;
    }

    setFeedbackAttachment(nextFile);
  };

  const saveProfile = (e) => {
    e.preventDefault();

    saveProfileMutation.mutate({
      display_name: profile.display_name,
      bio: profile.bio,
      advanced_mode: Boolean(profile.advanced_mode),
      favorite_tgc_id: profile.favorite_tgc_id ? Number(profile.favorite_tgc_id) : null,
      default_tgc_id: profile.default_tgc_id ? Number(profile.default_tgc_id) : null,
    });
  };

  const changePassword = (e) => {
    e.preventDefault();

    changePasswordMutation.mutate({
      old_password: oldPassword,
      new_password: newPassword,
    });
  };

  const updateUserRole = (userId, role) => {
    updateRoleMutation.mutate({ userId, role });
  };

  const deleteAccount = () => {
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

    deleteAccountMutation.mutate(deletePassword);
  };

  const copyFeedbackDraft = async () => {
    if (!hasFeedbackPayload) {
      showToast({
        type: 'error',
        message: 'Escribe algo o adjunta un archivo antes de copiar la sugerencia.',
      });
      return;
    }

    try {
      await copyTextToClipboard(feedbackPreview);
      showToast({
        type: 'success',
        message: 'Sugerencia copiada. Ya la puedes enviar al admin por el canal que prefieras.',
      });
    } catch (_error) {
      showToast({
        type: 'error',
        message: 'No se pudo copiar la sugerencia en este navegador.',
      });
    }
  };

  const sendFeedback = () => {
    if (!feedbackDraft.message.trim() && !feedbackAttachment) {
      showToast({
        type: 'error',
        message: 'Escribe un mensaje o adjunta un archivo multimedia antes de enviar la sugerencia.',
      });
      return;
    }

    sendFeedbackMutation.mutate({
      category: feedbackDraft.category,
      subject: feedbackDraft.subject.trim(),
      message: feedbackDraft.message.trim(),
      allow_contact: Boolean(feedbackDraft.allowContact),
      attachment: feedbackAttachment,
    });
  };

  const clearFeedbackDraft = () => {
    setFeedbackDraft(DEFAULT_FEEDBACK_DRAFT);
    clearFeedbackAttachment();

    try {
      window.localStorage.removeItem(FEEDBACK_STORAGE_KEY);
    } catch (_error) {
      // Ignore storage issues and keep the state cleared in memory.
    }

    showToast({ type: 'info', message: 'Borrador de sugerencia limpiado.' });
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
              <input
                type="text"
                value={ROLE_OPTIONS.find((option) => option.value === profile.role)?.label || profile.role}
                disabled
              />
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
                Permite marcar copias como faltantes directamente dentro del mazo sin tocar tu coleccion.
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
                placeholder="Cuentanos que juegas, coleccionas o gestionas."
              />
            </label>
          </div>

          <div className="settings-actions">
            <button type="submit" disabled={saveProfileMutation.isPending}>
              {saveProfileMutation.isPending ? 'Guardando...' : 'Guardar configuracion'}
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
            <button type="submit" disabled={changePasswordMutation.isPending}>
              {changePasswordMutation.isPending ? 'Actualizando...' : 'Cambiar contrasena'}
            </button>
          </div>
        </form>

        <section className="panel settings-panel settings-feedback-panel">
          <div className="settings-panel-header">
            <h2>Sugerencias para admin</h2>
            <p>
              Este buzon envia la sugerencia directamente al correo interno de admin sin abrir
              ningun cliente externo.
            </p>
          </div>

          <div className="settings-form-grid settings-feedback-grid">
            <label className="settings-field">
              <span>Categoria</span>
              <select
                value={feedbackDraft.category}
                onChange={(e) => updateFeedbackField('category', e.target.value)}
              >
                {FEEDBACK_CATEGORIES.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="settings-field">
              <span>Asunto</span>
              <input
                type="text"
                value={feedbackDraft.subject}
                onChange={(e) => updateFeedbackField('subject', e.target.value)}
                maxLength={120}
                placeholder="Ejemplo: Mejorar filtros de busqueda"
              />
            </label>

            <label className="settings-field settings-field-full">
              <span>Mensaje</span>
              <textarea
                value={feedbackDraft.message}
                onChange={(e) => updateFeedbackField('message', e.target.value)}
                rows={5}
                maxLength={1200}
                placeholder="Cuenta que te gustaria mejorar, que fallo has visto o que echas en falta."
              />
            </label>

            <div className="settings-field settings-field-full settings-attachment-field">
              <span>Adjunto multimedia</span>
              <label className="settings-file-picker">
                <input
                  ref={feedbackFileInputRef}
                  type="file"
                  accept={FEEDBACK_ATTACHMENT_ACCEPT}
                  onChange={handleFeedbackAttachmentChange}
                />
                <strong>{feedbackAttachment ? 'Cambiar archivo' : 'Seleccionar archivo'}</strong>
                <small>Imagen, video o audio. Maximo 5 MB.</small>
              </label>

              {feedbackAttachment && (
                <div className="settings-file-chip">
                  <div className="settings-file-chip-copy">
                    <strong>{feedbackAttachment.name}</strong>
                    <span>{formatFeedbackAttachmentSize(feedbackAttachment.size)}</span>
                  </div>
                  <button
                    type="button"
                    className="settings-ghost-button"
                    onClick={clearFeedbackAttachment}
                  >
                    Quitar
                  </button>
                </div>
              )}
            </div>

            <div className="settings-field settings-field-full settings-switch-field">
              <span>Permitir contacto</span>
              <label className="settings-switch">
                <input
                  type="checkbox"
                  checked={Boolean(feedbackDraft.allowContact)}
                  onChange={(e) => updateFeedbackField('allowContact', e.target.checked)}
                />
                <span className="settings-switch-slider" />
                <strong>{feedbackDraft.allowContact ? 'Si' : 'No'}</strong>
              </label>
              <small>
                Si lo activas, el borrador incluira tu nombre visible y tu email para que el admin
                pueda responderte.
              </small>
            </div>
          </div>

          <div className="settings-feedback-preview">
            <strong>Vista previa</strong>
            <pre>{feedbackPreview}</pre>
          </div>

          <div className="settings-actions settings-feedback-actions">
            <button type="button" onClick={copyFeedbackDraft}>
              Copiar sugerencia
            </button>
            <button
              type="button"
              className="settings-secondary-button"
              onClick={sendFeedback}
              disabled={sendFeedbackMutation.isPending}
            >
              {sendFeedbackMutation.isPending ? 'Enviando...' : 'Enviar sugerencia'}
            </button>
            <button type="button" className="settings-ghost-button" onClick={clearFeedbackDraft}>
              Limpiar borrador
            </button>
          </div>
        </section>

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
              disabled={deleteAccountMutation.isPending}
            >
              {deleteAccountMutation.isPending ? 'Borrando cuenta...' : 'Borrar cuenta'}
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
                      disabled={updateRoleMutation.isPending && updateRoleMutation.variables?.userId === user.id}
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
