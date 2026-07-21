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
      <section className="rounded-3xl border border-[#D8D8D8] bg-[#F8F8F8] p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-[#121212]">Notificaciones</h1>
        <p className="mt-2 text-[#3E3E3E]">Activa recordatorios para mantener el ritmo y revisar tu progreso regularmente.</p>
      </section>

      <section className="mt-8 space-y-4">
        {notificationOptions.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => toggleNotification(item.id)}
            className={`w-full rounded-3xl border px-6 py-5 text-left transition ${
              activeNotifications.includes(item.id)
                ? 'border-[#121212] bg-[#121212] text-white'
                : 'border-[#D8D8D8] bg-[#F8F8F8] text-[#121212] hover:border-[#C0C0C0] hover:bg-[#EBEBEB]'
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">{item.label}</h2>
                <p className={`mt-2 ${activeNotifications.includes(item.id) ? 'text-white/70' : 'text-[#3E3E3E]'}`}>{item.description}</p>
              </div>
              <span className={`text-sm uppercase tracking-[0.2em] ${activeNotifications.includes(item.id) ? 'text-white/60' : 'text-[#9B9B9B]'}`}>
                {activeNotifications.includes(item.id) ? 'Activo' : 'Inactivo'}
              </span>
            </div>
          </button>
        ))}
      </section>
    </main>
  );
}
