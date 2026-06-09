-- ============================================================
-- NEXA — Datos iniciales: 65 ejercicios
-- Ejecutar DESPUÉS del schema en el SQL Editor de Supabase
-- ============================================================

insert into public.ejercicios (nombre, grupo_muscular, descripcion, youtube_url) values

-- PECHO
('Press de banca plano',        'pecho',    'Ejercicio compuesto para pecho con barra en banco plano.',          'https://youtube.com/watch?v=rT7DgCr-3pg'),
('Press de banca inclinado',    'pecho',    'Press en banco inclinado para la parte alta del pecho.',           'https://youtube.com/watch?v=jPLdzuHckI8'),
('Press de banca declinado',    'pecho',    'Press en banco declinado para la parte baja del pecho.',           'https://youtube.com/watch?v=OR41iA6RfPo'),
('Press con mancuernas plano',  'pecho',    'Variante con mancuernas, mayor rango de movimiento.',              'https://youtube.com/watch?v=VmB1G1K7v94'),
('Aperturas con mancuernas',    'pecho',    'Aislamiento para el pecho.',                                       'https://youtube.com/watch?v=eozdVDA78K0'),
('Flexiones',                   'pecho',    'Ejercicio con peso corporal para pecho y tríceps.',                'https://youtube.com/watch?v=IODxDxX7oi4'),
('Cruces en polea',             'pecho',    'Cruces con poleas para aislamiento del pecho.',                    'https://youtube.com/watch?v=taI4XduLpTk'),

-- ESPALDA
('Dominadas',                   'espalda',  'Jalón con el peso corporal, excelente para dorsal ancho.',         'https://youtube.com/watch?v=eGo4IYlbE5g'),
('Peso muerto',                 'espalda',  'Ejercicio compuesto fundamental para la cadena posterior.',        'https://youtube.com/watch?v=op9kVnSso6Q'),
('Remo con barra',              'espalda',  'Jalón horizontal con barra para espalda media.',                   'https://youtube.com/watch?v=9efgcAjQe7E'),
('Remo con mancuerna',          'espalda',  'Remo unilateral con mancuerna para espalda media.',                'https://youtube.com/watch?v=roCP6wCXPqo'),
('Jalón al pecho',              'espalda',  'Jalón en polea alta para dorsal ancho.',                           'https://youtube.com/watch?v=CAwf7n6Luuc'),
('Remo en polea baja',          'espalda',  'Remo horizontal en máquina de polea.',                             'https://youtube.com/watch?v=GZbfZ033f74'),
('Pull-over con mancuerna',     'espalda',  'Ejercicio de expansión para el dorsal.',                           'https://youtube.com/watch?v=MLsJQdgVop4'),
('Hiperextensiones',            'espalda',  'Ejercicio para la zona lumbar y erector espinal.',                 'https://youtube.com/watch?v=ph3pddpKzzw'),

-- HOMBROS
('Press militar con barra',     'hombros',  'Press sobre la cabeza con barra para deltoides.',                  'https://youtube.com/watch?v=2yjwXTZQDDI'),
('Press Arnold',                'hombros',  'Press con mancuernas con rotación, trabaja todos los haces.',      'https://youtube.com/watch?v=3ml7BH7mNwQ'),
('Elevaciones laterales',       'hombros',  'Aislamiento para el deltoides lateral.',                           'https://youtube.com/watch?v=3VcKaXpzqRo'),
('Elevaciones frontales',       'hombros',  'Aislamiento para el deltoides anterior.',                          'https://youtube.com/watch?v=sOSGFSGxMWs'),
('Pájaros',                     'hombros',  'Elevaciones inclinadas para deltoides posterior.',                  'https://youtube.com/watch?v=ttvfGg9d76c'),
('Face pull',                   'hombros',  'Jalón a la cara con cuerda en polea alta.',                        'https://youtube.com/watch?v=rep-qVOkqgk'),
('Encogimientos de hombros',    'hombros',  'Ejercicio para el trapecio.',                                      'https://youtube.com/watch?v=cJRVVxmytaM'),

-- BÍCEPS
('Curl con barra',              'biceps',   'Curl clásico con barra para bíceps.',                              'https://youtube.com/watch?v=ykJmrZ5v0Oo'),
('Curl con mancuernas',         'biceps',   'Curl alternado con mancuernas.',                                   'https://youtube.com/watch?v=sAq_ocpRh_I'),
('Curl martillo',               'biceps',   'Curl con agarre neutro para braquial y braquiorradial.',           'https://youtube.com/watch?v=zC3nLlEvin4'),
('Curl en polea',               'biceps',   'Curl con polea baja para tensión constante.',                      'https://youtube.com/watch?v=NBY9-kTuHEk'),
('Curl concentrado',            'biceps',   'Curl unilateral sentado para máximo pico de bíceps.',              'https://youtube.com/watch?v=Jvj2wV0vOYU'),
('Curl en banco inclinado',     'biceps',   'Curl con mancuernas en banco inclinado, mayor estiramiento.',      'https://youtube.com/watch?v=soxrZlIl35U'),

-- TRÍCEPS
('Fondos en paralelas',         'triceps',  'Ejercicio compuesto con peso corporal para tríceps.',              'https://youtube.com/watch?v=0326dy_-CzM'),
('Press francés',               'triceps',  'Extensión de codo con barra EZ para tríceps.',                    'https://youtube.com/watch?v=d_KZxkY_0cM'),
('Extensión en polea alta',     'triceps',  'Jalón de polea con barra o cuerda hacia abajo.',                   'https://youtube.com/watch?v=2-LAMcpzODU'),
('Patada de tríceps',           'triceps',  'Extensión de codo inclinado con mancuerna.',                       'https://youtube.com/watch?v=l3WkovXkIBk'),
('Press cerrado en banca',      'triceps',  'Press de banca con agarre estrecho para tríceps.',                 'https://youtube.com/watch?v=nEF0bv2FW94'),
('Extensión sobre la cabeza',   'triceps',  'Extensión de tríceps sobre la cabeza con mancuerna.',              'https://youtube.com/watch?v=YbX7Wd8jQ-Q'),

-- PIERNAS
('Sentadilla con barra',        'piernas',  'El rey de los ejercicios de piernas.',                             'https://youtube.com/watch?v=ultWZbUMPL8'),
('Sentadilla frontal',          'piernas',  'Sentadilla con barra al frente para cuádriceps.',                  'https://youtube.com/watch?v=uYumuL_G_V0'),
('Sentadilla hack',             'piernas',  'Sentadilla en máquina hack para cuádriceps.',                      'https://youtube.com/watch?v=EdtPAT3eROM'),
('Prensa de piernas',           'piernas',  'Prensa en máquina, buena alternativa a la sentadilla.',            'https://youtube.com/watch?v=IZxyjW7MPJQ'),
('Extensión de cuádriceps',     'piernas',  'Extensión en máquina para aislamiento del cuádriceps.',            'https://youtube.com/watch?v=YyvSfVjQeL0'),
('Curl femoral tumbado',        'piernas',  'Curl de isquiotibiales en máquina tumbado.',                       'https://youtube.com/watch?v=ELOCsoDSmrg'),
('Curl femoral sentado',        'piernas',  'Curl de isquiotibiales en máquina sentado.',                       'https://youtube.com/watch?v=1Tq3QdYUuHs'),
('Peso muerto rumano',          'piernas',  'Bisagra de cadera para isquiotibiales y glúteos.',                 'https://youtube.com/watch?v=JCXUYuzwNrM'),
('Zancadas',                    'piernas',  'Zancadas con mancuernas para cuádriceps y glúteos.',               'https://youtube.com/watch?v=QOVaHwm-Q6U'),
('Zancadas búlgaras',           'piernas',  'Split squat con pie trasero elevado.',                             'https://youtube.com/watch?v=2C-uNgKwPLE'),
('Elevación de gemelos de pie', 'piernas',  'Ejercicio para el gastrocnemio de pie.',                           'https://youtube.com/watch?v=-M4-G8p1fCI'),

-- GLÚTEOS
('Hip thrust con barra',        'gluteos',  'El mejor ejercicio para glúteos con barra en banco.',              'https://youtube.com/watch?v=SEdqd1n0cvg'),
('Puente de glúteos',           'gluteos',  'Variante de hip thrust en el suelo.',                              'https://youtube.com/watch?v=OUgsJ8-Vi0E'),
('Patada trasera en polea',     'gluteos',  'Extensión de cadera en polea baja para glúteo mayor.',             'https://youtube.com/watch?v=3HGMi5MO5Fg'),
('Abducción en máquina',        'gluteos',  'Apertura de piernas en máquina para glúteo medio.',                'https://youtube.com/watch?v=PvPPBMxFWu8'),
('Sentadilla sumo',             'gluteos',  'Sentadilla con stance amplio para glúteos e isquios.',             'https://youtube.com/watch?v=s8oHFtGCMDM'),
('Step up con mancuernas',      'gluteos',  'Subida a cajón con mancuernas.',                                   'https://youtube.com/watch?v=WCFCdxzFBa4'),

-- CORE
('Plancha',                     'core',     'Ejercicio isométrico fundamental para el core.',                   'https://youtube.com/watch?v=ASdvN_XEl_c'),
('Plancha lateral',             'core',     'Plancha lateral para oblicuos.',                                   'https://youtube.com/watch?v=_rdfjFSFKcE'),
('Crunch abdominal',            'core',     'Flexión de tronco para recto abdominal.',                          'https://youtube.com/watch?v=Xyd_fa5zoEU'),
('Crunch en polea',             'core',     'Crunch con resistencia en polea alta.',                            'https://youtube.com/watch?v=AV5PaePD66g'),
('Elevación de piernas colgado','core',     'Elevación de piernas en barra para abdomen bajo.',                 'https://youtube.com/watch?v=hdng3Nm1x_E'),
('Rueda abdominal',             'core',     'Ejercicio con rueda para core completo.',                          'https://youtube.com/watch?v=rq2AWVKBLGs'),
('Russian twist',               'core',     'Rotación de tronco para oblicuos.',                                'https://youtube.com/watch?v=wkD8rjkodUI'),
('Dead bug',                    'core',     'Ejercicio de estabilización lumbo-pélvica.',                       'https://youtube.com/watch?v=4XLEnwUr1d8'),

-- CARDIO
('Sprints en cinta',            'cardio',   'Intervalos de alta intensidad en cinta.',                          null),
('Bicicleta estática',          'cardio',   'Cardio de bajo impacto en bicicleta.',                             null),
('Remo en máquina',             'cardio',   'Ejercicio cardiovascular de cuerpo completo.',                     null),
('Cuerda para saltar',          'cardio',   'Salto con cuerda para cardio y coordinación.',                     null),
('Burpees',                     'cardio',   'Ejercicio de cuerpo completo de alta intensidad.',                  null),
('Mountain climbers',           'cardio',   'Escaladores para cardio y core.',                                  null),
('Batalla de cuerdas',          'cardio',   'Battle ropes para cardio y fuerza.',                               null);
