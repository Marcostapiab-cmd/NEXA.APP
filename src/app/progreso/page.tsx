'use client';

import { progressSummary } from '@/lib/mockData';

export default function ProgresoPage() {
  return (
    <main className="mx-auto min-h-[calc(100vh-96px)] max-w-6xl px-4 py-8 sm:px-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-slate-900">Progreso</h1>
        <p className="mt-2 text-slate-600">Revisa tu evolución semanal, tu consistencia y tus mejores marcas.</p>
      </section>

      <section className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-3xl border border-slate-200 bg-slate-50 p-6 text-slate-900 shadow-sm">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Sesiones totales</p>
          <p className="mt-4 text-4xl font-semibold">{progressSummary.totalSessions}</p>
        </article>
        <article className="rounded-3xl border border-slate-200 bg-slate-50 p-6 text-slate-900 shadow-sm">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Completadas</p>
          <p className="mt-4 text-4xl font-semibold">{progressSummary.completedSessions}</p>
        </article>
        <article className="rounded-3xl border border-slate-200 bg-slate-50 p-6 text-slate-900 shadow-sm">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Consistencia</p>
          <p className="mt-4 text-4xl font-semibold">{progressSummary.consistency}</p>
        </article>
        <article className="rounded-3xl border border-slate-200 bg-slate-50 p-6 text-slate-900 shadow-sm">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Calorías</p>
          <p className="mt-4 text-4xl font-semibold">{progressSummary.caloriesBurned}</p>
        </article>
      </section>

      <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-900">Récord personal</h2>
        <p className="mt-3 text-slate-600">{progressSummary.personalBest}</p>
      </section>
    </main>
  );
}
