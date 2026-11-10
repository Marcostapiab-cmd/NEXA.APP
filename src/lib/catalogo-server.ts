// Solo para Server Components / route handlers (usa cookies de next/headers).
import { createClient } from '@/lib/supabase/server';
import { esClaseDePrueba, type CatalogoPublico, type ConfigPrecios, type PlanGrupal, type PrecioEntrenamiento } from '@/lib/catalogo';

/** Lee el catálogo público desde Supabase (RLS permite lectura anónima). */
export async function getCatalogoPublico(): Promise<CatalogoPublico> {
  try {
    const supabase = await createClient();
    const [grupales, precios, config] = await Promise.all([
      supabase
        .from('planes_grupales')
        .select('id, nombre, descripcion, precio_clp, num_clases, validez_dias, destacado')
        .eq('activo', true)
        .order('orden'),
      supabase
        .from('precios_entrenamiento')
        .select('modalidad, frecuencia_semanal, precio_mes_clp')
        .order('frecuencia_semanal'),
      supabase
        .from('precios_entrenamiento_config')
        .select('clave, valor'),
    ]);

    const cfg: ConfigPrecios = {};
    for (const c of (config.data ?? []) as { clave: string; valor: number }[]) cfg[c.clave] = c.valor;

    return {
      // Sin clases grupales por ahora: solo se ofrece la Clase de Prueba
      // (evaluación inicial), aunque haya otros packs activos en la base.
      grupales: ((grupales.data ?? []) as PlanGrupal[]).filter(esClaseDePrueba),
      precios:  (precios.data ?? []) as PrecioEntrenamiento[],
      config:   cfg,
      error:    Boolean(grupales.error || precios.error || config.error),
    };
  } catch (err) {
    console.error('[catalogo] error leyendo catálogo:', err);
    return { grupales: [], precios: [], config: {}, error: true };
  }
}
