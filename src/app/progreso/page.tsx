'use client';

import { progressSummary } from '@/lib/mockData';

export default function ProgresoPage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6">
      <section className="rounded-3xl border border-[#D8D8D8] bg-[#F8F8F8] p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-[#121212]">Progreso</h1>
        <p className="mt-2 text-[#3E3E3E]">Revisa tu evolución semanal, tu consistencia y tus mejores marcas.</p>
      </section>

      <section className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-3xl border border-[#D8D8D8] bg-[#EBEBEB] p-6 text-[#121212] shadow-sm">
          <p className="text-sm uppercase tracking-[0.2em] text-[#9B9B9B]">Sesiones totales</p>
          <p className="mt-4 text-4xl font-semibold">{progressSummary.totalSessions}</p>
        </article>
        <article className="rounded-3xl border border-[#D8D8D8] bg-[#EBEBEB] p-6 text-[#121212] shadow-sm">
          <p className="text-sm uppercase tracking-[0.2em] text-[#9B9B9B]">Completadas</p>
          <p className="mt-4 text-4xl font-semibold">{progressSummary.completedSessions}</p>
        </article>
        <article className="rounded-3xl border border-[#D8D8D8] bg-[#EBEBEB] p-6 text-[#121212] shadow-sm">
          <p className="text-sm uppercase tracking-[0.2em] text-[#9B9B9B]">Consistencia</p>
          <p className="mt-4 text-4xl font-semibold">{progressSummary.consistency}</p>
        </article>
        <article className="rounded-3xl border border-[#D8D8D8] bg-[#EBEBEB] p-6 text-[#121212] shadow-sm">
          <p className="text-sm uppercase tracking-[0.2em] text-[#9B9B9B]">Calorías</p>
          <p className="mt-4 text-4xl font-semibold">{progressSummary.caloriesBurned}</p>
        </article>
      </section>

      <section className="mt-8 rounded-3xl border border-[#D8D8D8] bg-[#F8F8F8] p-8 shadow-sm">
        <h2 className="text-2xl font-semibold text-[#121212]">Récord personal</h2>
        <p className="mt-3 text-[#3E3E3E]">{progressSummary.personalBest}</p>
      </section>
    </main>
  );
}
