import React, { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { PUBLIC_CONTACT_CATEGORIES, PUBLIC_FAQ_ITEMS } from '../content/publicContent';
import { sendPublicContact } from '../services/api';
import { getApiErrorMessage } from '../utils/apiMessages';
import {
  FEEDBACK_ATTACHMENT_ACCEPT,
  FEEDBACK_MAX_ATTACHMENT_BYTES,
  formatFeedbackAttachmentSize,
  isSupportedFeedbackAttachment,
} from '../utils/feedbackForm';

const DEFAULT_CONTACT_FORM = {
  name: '',
  email: '',
  category: 'idea',
  subject: '',
  message: '',
  allowContact: true,
};

function ContactPage() {
  const { profile } = useSession();
  const { showToast } = useToast();
  const [form, setForm] = useState(DEFAULT_CONTACT_FORM);
  const [attachment, setAttachment] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      name: current.name || profile?.display_name || profile?.username || '',
      email: current.email || profile?.email || '',
    }));
  }, [profile?.display_name, profile?.email, profile?.username]);

  const contactMutation = useMutation({
    mutationFn: sendPublicContact,
    onSuccess: () => {
      setForm((current) => ({
        ...DEFAULT_CONTACT_FORM,
        name: profile?.display_name || profile?.username || '',
        email: profile?.email || '',
      }));
      setAttachment(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      showToast({ type: 'success', message: 'Mensaje enviado. Gracias por escribirnos.' });
    },
    onError: (error) => {
      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo enviar el mensaje.'),
      });
    },
  });

  const updateField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const clearAttachment = () => {
    setAttachment(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAttachmentChange = (event) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) {
      clearAttachment();
      return;
    }

    if (selectedFile.size > FEEDBACK_MAX_ATTACHMENT_BYTES) {
      clearAttachment();
      showToast({
        type: 'error',
        message: 'El adjunto supera el limite de 5 MB.',
      });
      return;
    }

    if (!isSupportedFeedbackAttachment(selectedFile)) {
      clearAttachment();
      showToast({
        type: 'error',
        message: 'Solo se permiten imagenes, audio o video.',
      });
      return;
    }

    setAttachment(selectedFile);
  };

  const submitContact = (event) => {
    event.preventDefault();

    if (!form.message.trim() && !attachment) {
      showToast({
        type: 'error',
        message: 'Escribe un mensaje o adjunta un archivo antes de enviar.',
      });
      return;
    }

    if (form.allowContact && !form.email.trim()) {
      showToast({
        type: 'error',
        message: 'Si quieres respuesta, necesitamos un email de contacto.',
      });
      return;
    }

    contactMutation.mutate({
      name: form.name.trim(),
      email: form.email.trim(),
      category: form.category,
      subject: form.subject.trim(),
      message: form.message.trim(),
      allow_contact: Boolean(form.allowContact),
      attachment,
    });
  };

  return (
    <div className="page-shell public-page">
      <section className="page-hero public-page-hero">
        <div>
          <span className="eyebrow">Contacto</span>
          <h1>Escribenos sin pasar por la cuenta</h1>
          <p>
            Si quieres avisar de un bug, proponer una mejora o comentar algo de datos y mazos,
            puedes hacerlo desde aqui aunque no tengas sesion abierta.
          </p>
        </div>

        <div className="hero-stat hero-stat--contact">
          <span>Canal directo</span>
          <strong>
            <a href="mailto:multiversetgc@gmail.com">multiversetgc@gmail.com</a>
          </strong>
        </div>
      </section>

      <section className="contact-layout">
        <form className="panel settings-panel contact-form-panel" onSubmit={submitContact}>
          <div className="settings-panel-header">
            <h2>Formulario publico</h2>
            <p>Te responderemos si marcas que permites contacto y dejas un email valido.</p>
          </div>

          <div className="settings-form-grid">
            <label className="settings-field">
              <span>Nombre</span>
              <input
                type="text"
                value={form.name}
                onChange={(event) => updateField('name', event.target.value)}
                maxLength={100}
                placeholder="Como quieres que te llamemos"
              />
            </label>

            <label className="settings-field">
              <span>Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) => updateField('email', event.target.value)}
                maxLength={100}
                placeholder="Solo si quieres respuesta"
              />
            </label>

            <label className="settings-field">
              <span>Categoria</span>
              <select
                value={form.category}
                onChange={(event) => updateField('category', event.target.value)}
              >
                {PUBLIC_CONTACT_CATEGORIES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="settings-field">
              <span>Asunto</span>
              <input
                type="text"
                value={form.subject}
                onChange={(event) => updateField('subject', event.target.value)}
                maxLength={120}
                placeholder="Resumen rapido"
              />
            </label>

            <label className="settings-field settings-field-full">
              <span>Mensaje</span>
              <textarea
                rows={7}
                value={form.message}
                onChange={(event) => updateField('message', event.target.value)}
                maxLength={1200}
                placeholder="Cuentanos que te falla, que echas en falta o que te gustaria mejorar."
              />
            </label>

            <div className="settings-field settings-field-full settings-switch-field">
              <span>Permitir contacto</span>
              <label className="settings-switch">
                <input
                  type="checkbox"
                  checked={Boolean(form.allowContact)}
                  onChange={(event) => updateField('allowContact', event.target.checked)}
                />
                <span className="settings-switch-slider" />
                <strong>{form.allowContact ? 'Si' : 'No'}</strong>
              </label>
              <small>Si esta activo, tu email pasa a ser obligatorio para poder responderte.</small>
            </div>

            <div className="settings-field settings-field-full settings-attachment-field">
              <span>Adjunto opcional</span>
              <label className="settings-file-picker">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={FEEDBACK_ATTACHMENT_ACCEPT}
                  onChange={handleAttachmentChange}
                />
                <strong>{attachment ? 'Cambiar archivo' : 'Seleccionar archivo'}</strong>
                <small>Imagen, audio o video de hasta 5 MB.</small>
              </label>

              {attachment && (
                <div className="settings-file-chip">
                  <div className="settings-file-chip-copy">
                    <strong>{attachment.name}</strong>
                    <span>{formatFeedbackAttachmentSize(attachment.size)}</span>
                  </div>
                  <button
                    type="button"
                    className="deck-action-button is-neutral deck-inline-action"
                    onClick={clearAttachment}
                  >
                    Quitar
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="settings-actions settings-feedback-actions">
            <button type="submit" disabled={contactMutation.isPending}>
              {contactMutation.isPending ? 'Enviando...' : 'Enviar mensaje'}
            </button>
          </div>
        </form>

        <div className="contact-side">
          <section className="panel public-info-card">
            <span className="eyebrow">FAQ</span>
            <h2>Preguntas frecuentes</h2>
            <div className="contact-faq-list">
              {PUBLIC_FAQ_ITEMS.map((item) => (
                <article key={item.id} className="contact-faq-item">
                  <strong>{item.question}</strong>
                  <p>{item.answer}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="panel public-info-card">
            <span className="eyebrow">Antes de escribir</span>
            <h2>Atajos utiles</h2>
            <p>
              Si quieres entender primero el producto, puedes entrar en la demo o revisar las
              ultimas novedades antes de escribirnos.
            </p>
            <div className="guest-demo-actions">
              <Link className="guest-demo-secondary-link" to="/search">
                Ver demo
              </Link>
              <Link className="guest-demo-secondary-link" to="/updates">
                Ver novedades
              </Link>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

export default ContactPage;
