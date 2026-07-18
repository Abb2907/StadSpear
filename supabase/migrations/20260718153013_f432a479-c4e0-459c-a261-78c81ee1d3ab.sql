
DELETE FROM public.telemetry_cache;
INSERT INTO public.telemetry_cache (stadium, metric, value, generated_at) VALUES
('MetLife','gate_wait_min', '{"label":"Avg gate wait","value":"7 min","trend":"steady","note":"Gates A-D nominal; Gate F +3 min"}'::jsonb, now()),
('MetLife','concourse_density', '{"label":"Concourse density","value":"62%","trend":"rising","note":"North concourse near threshold"}'::jsonb, now()),
('MetLife','transit_eta', '{"label":"NJ Transit next train","value":"11 min","trend":"steady","note":"Meadowlands line on time"}'::jsonb, now()),
('MetLife','accessibility', '{"label":"ADA routes","value":"3 open","trend":"steady","note":"Elevator E2 out of service"}'::jsonb, now()),
('MetLife','sustainability', '{"label":"Recycling capture","value":"71%","trend":"rising","note":"Add 2 bins near Gate C"}'::jsonb, now()),

('SoFi','gate_wait_min', '{"label":"Avg gate wait","value":"5 min","trend":"falling","note":"All gates flowing"}'::jsonb, now()),
('SoFi','concourse_density', '{"label":"Concourse density","value":"48%","trend":"steady","note":"South plaza light"}'::jsonb, now()),
('SoFi','transit_eta', '{"label":"Metro K Line","value":"6 min","trend":"steady","note":"Hawthorne/Lennox next"}'::jsonb, now()),
('SoFi','accessibility', '{"label":"ADA routes","value":"4 open","trend":"steady","note":"All elevators nominal"}'::jsonb, now()),
('SoFi','sustainability', '{"label":"Water refill use","value":"1,240 fills","trend":"rising","note":"Hydration station 3 low"}'::jsonb, now()),

('AT&T','gate_wait_min', '{"label":"Avg gate wait","value":"9 min","trend":"rising","note":"Gate C surge — deploy 2 volunteers"}'::jsonb, now()),
('AT&T','concourse_density', '{"label":"Concourse density","value":"74%","trend":"rising","note":"Level 300 approaching cap"}'::jsonb, now()),
('AT&T','transit_eta', '{"label":"TRE next shuttle","value":"14 min","trend":"steady","note":"Victory Station link"}'::jsonb, now()),
('AT&T','accessibility', '{"label":"ADA routes","value":"3 open","trend":"steady","note":"Ramp B closed for cleaning"}'::jsonb, now()),
('AT&T','sustainability', '{"label":"Recycling capture","value":"64%","trend":"steady","note":"Compost bins full at Sec 240"}'::jsonb, now()),

('Azteca','gate_wait_min', '{"label":"Espera en accesos","value":"12 min","trend":"rising","note":"Acceso Norte con alta demanda"}'::jsonb, now()),
('Azteca','concourse_density', '{"label":"Densidad de pasillos","value":"81%","trend":"rising","note":"Nivel Palcos cerca de cupo"}'::jsonb, now()),
('Azteca','transit_eta', '{"label":"Metro Tren Ligero","value":"8 min","trend":"steady","note":"Estación Estadio Azteca"}'::jsonb, now()),
('Azteca','accessibility', '{"label":"Rutas accesibles","value":"2 open","trend":"steady","note":"Elevador Sur en mantenimiento"}'::jsonb, now()),
('Azteca','sustainability', '{"label":"Reciclaje","value":"58%","trend":"rising","note":"Añadir contenedores en Acceso 4"}'::jsonb, now()),

('BMO','gate_wait_min', '{"label":"Avg gate wait","value":"6 min","trend":"steady","note":"West gate flowing well"}'::jsonb, now()),
('BMO','concourse_density', '{"label":"Concourse density","value":"55%","trend":"steady","note":"East side moderate"}'::jsonb, now()),
('BMO','transit_eta', '{"label":"GO Transit / TTC","value":"9 min","trend":"steady","note":"Exhibition GO next departure"}'::jsonb, now()),
('BMO','accessibility', '{"label":"ADA routes","value":"3 open","trend":"steady","note":"All lifts operational"}'::jsonb, now()),
('BMO','sustainability', '{"label":"Recycling capture","value":"78%","trend":"rising","note":"Toronto Water refill kiosks active"}'::jsonb, now());
