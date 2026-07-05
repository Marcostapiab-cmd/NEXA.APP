'use client';

import { useState } from 'react';

const notificationOptions = [
  { id: 'morning', label: 'Recordatorio matutino', description: 'Hora de entrenamiento al comenzar el día.' },
  { id: 'afternoon', label: 'Recordatorio vespertino', description: 'Tiempo para tu rutina después del almuerzo.' },
  { id: 'weekly', label: 'Resumen semanal', description: 'Resumen automático al final de la semana.' },
];

export default function NotificacionesPage() {
  const [activeNotifications, setActiveNotifications] = useState<string[]>(['morning']);

  const toggleNotification = (id: string) => {
    setActiveNotifications((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-slate-900">Notificaciones</h1>
        <p className="mt-2 text-slate-600">Activa recordatorios para mantener el ritmo y revisar tu progreso regularmente.</p>
      </section>

      <section className="mt-8 space-y-4">
        {notificationOptions.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => toggleNotification(item.id)}
            className={`w-full rounded-3xl border px-6 py-5 text-left transition ${
              activeNotifications.includes(item.id)
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">{item.label}</h2>
                <p className="mt-2 text-slate-600">{item.description}</p>
              </div>
              <span className="text-sm uppercase tracking-[0.2em] text-slate-500">
                {activeNotifications.includes(item.id) ? 'Activo' : 'Inactivo'}
              </span>
            </div>
          </button>
        ))}
      </section>
    </main>
  );
}
