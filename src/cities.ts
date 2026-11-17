// Cidades monitoradas na área do radar de Chapecó (coordenadas e códigos oficiais do IBGE).
export const NEARBY_CITIES = [
  { name: 'Chapecó', ibge: '4204202', coords: [-27.1004, -52.6152] as [number, number], state: 'SC', isCenter: true },
  { name: 'Xaxim', ibge: '4219705', coords: [-26.9596, -52.5374] as [number, number], state: 'SC' },
  { name: 'Xanxerê', ibge: '4219507', coords: [-26.8747, -52.4036] as [number, number], state: 'SC' },
  { name: 'Concórdia', ibge: '4204301', coords: [-27.2335, -52.026] as [number, number], state: 'SC' },
  { name: 'Seara', ibge: '4217501', coords: [-27.1564, -52.299] as [number, number], state: 'SC' },
  { name: 'Pinhalzinho', ibge: '4212908', coords: [-26.8495, -52.9913] as [number, number], state: 'SC' },
  { name: 'Maravilha', ibge: '4210506', coords: [-26.7665, -53.1737] as [number, number], state: 'SC' },
  { name: 'São Miguel do Oeste', ibge: '4217204', coords: [-26.7242, -53.5163] as [number, number], state: 'SC' },
  { name: 'Itapiranga', ibge: '4208401', coords: [-27.1659, -53.7166] as [number, number], state: 'SC' },
  { name: 'Nonoai', ibge: '4312708', coords: [-27.3689, -52.7756] as [number, number], state: 'RS' },
  { name: 'Erechim', ibge: '4307005', coords: [-27.6364, -52.2697] as [number, number], state: 'RS' },
  { name: 'Passo Fundo', ibge: '4314100', coords: [-28.2576, -52.4091] as [number, number], state: 'RS' },
  { name: 'Pato Branco', ibge: '4118501', coords: [-26.2292, -52.6706] as [number, number], state: 'PR' },
  { name: 'Francisco Beltrão', ibge: '4108403', coords: [-26.0817, -53.0535] as [number, number], state: 'PR' },
];

/** Cidades da família fora da área do radar de Chapecó (o satélite cobre tudo). */
export const FAMILY_CITIES = [
  { name: 'Lages', coords: [-27.816, -50.326] as [number, number], state: 'SC' },
  { name: 'Santo Augusto', coords: [-27.851, -53.777] as [number, number], state: 'RS' },
];
