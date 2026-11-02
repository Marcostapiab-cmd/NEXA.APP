// Markdown mínimo para textos de NEXA (reglamento): títulos ##/###, listas "- ",
// **negrita** y párrafos. React escapa todo el texto: no se inyecta HTML.

import { Fragment, type ReactNode } from 'react';

function enLinea(texto: string): ReactNode[] {
  return texto.split(/(\*\*[^*]+\*\*)/g).map((t, i) =>
    t.startsWith('**') && t.endsWith('**') ? <strong key={i}>{t.slice(2, -2)}</strong> : <Fragment key={i}>{t}</Fragment>);
}

export default function Markdown({ texto, className = '' }: { texto: string; className?: string }) {
  const bloques: ReactNode[] = [];
  let lista: string[] = [];
  let parrafo: string[] = [];
  const cerrar = () => {
    if (parrafo.length) { bloques.push(<p key={bloques.length} className="my-3 leading-relaxed">{enLinea(parrafo.join(' '))}</p>); parrafo = []; }
    if (lista.length) {
      bloques.push(<ul key={bloques.length} className="my-3 list-disc space-y-1.5 pl-5 leading-relaxed">{lista.map((l, i) => <li key={i}>{enLinea(l)}</li>)}</ul>);
      lista = [];
    }
  };
  for (const linea of texto.split('\n')) {
    const l = linea.trim();
    if (!l) { cerrar(); continue; }
    if (l.startsWith('### ')) { cerrar(); bloques.push(<h3 key={bloques.length} className="mb-1 mt-5 font-bold">{enLinea(l.slice(4))}</h3>); continue; }
    if (l.startsWith('## '))  { cerrar(); bloques.push(<h2 key={bloques.length} className="mb-1 mt-7 text-lg font-bold">{enLinea(l.slice(3))}</h2>); continue; }
    if (l.startsWith('- '))   { if (parrafo.length) cerrar(); lista.push(l.slice(2)); continue; }
    if (lista.length) cerrar();
    parrafo.push(l);
  }
  cerrar();
  return <div className={className}>{bloques}</div>;
}
