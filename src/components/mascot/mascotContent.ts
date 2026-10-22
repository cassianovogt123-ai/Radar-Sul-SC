// Conteúdo educativo do Pingo (gatinho da prevenção).
// Baseado nas orientações gerais da Defesa Civil e do Corpo de Bombeiros.

export type ScenarioId = 'enchente' | 'tempestade' | 'deslizamento' | 'incendio';
export type PhaseId = 'antes' | 'durante' | 'depois';

export interface StepCard {
  icon: string;
  title: string;
  text: string;
}

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
  why: string;
}

export interface Scenario {
  id: ScenarioId;
  emoji: string;
  title: string;
  short: string;
  /** Classes de cor do cartão (Tailwind) */
  tone: string;
  intro: string;
  phases: Record<PhaseId, StepCard[]>;
  quiz: QuizQuestion[];
}

export const PHASES: { id: PhaseId; label: string; tone: string; pingo: string }[] = [
  {
    id: 'antes',
    label: 'Antes',
    tone: 'text-sky-200 border-sky-400/40 bg-sky-400/15',
    pingo: 'Prevenir é o melhor guarda-chuva! Veja o que preparar com calma.',
  },
  {
    id: 'durante',
    label: 'Durante',
    tone: 'text-amber-200 border-amber-400/40 bg-amber-400/15',
    pingo: 'Agora é hora de agir rápido e com segurança. Sua vida vem primeiro!',
  },
  {
    id: 'depois',
    label: 'Depois',
    tone: 'text-emerald-200 border-emerald-400/40 bg-emerald-400/15',
    pingo: 'Passou o perigo? Calma: ainda há cuidados importantes.',
  },
];

export const SCENARIOS: Scenario[] = [
  {
    id: 'enchente',
    emoji: '🌊',
    title: 'Inundações e enchentes',
    short: 'Água subindo rápido',
    tone: 'from-sky-500/25 to-cyan-500/5 border-sky-400/30',
    intro: 'Rios enchem rápido com chuva forte. Saber o que fazer salva vidas!',
    phases: {
      antes: [
        { icon: '🗺️', title: 'Conheça o risco', text: 'Descubra se sua rua alaga e qual o caminho até um local alto e seguro.' },
        { icon: '📲', title: 'Receba alertas', text: 'Envie seu CEP por SMS para 40199 e receba avisos da Defesa Civil.' },
        { icon: '📄', title: 'Proteja documentos', text: 'Guarde documentos e remédios em saco plástico, em lugar alto.' },
        { icon: '🎒', title: 'Mochila pronta', text: 'Deixe a mochila de emergência perto da porta.' },
        { icon: '🧹', title: 'Bueiro limpo', text: 'Não jogue lixo na rua: ele entope bueiros e piora o alagamento.' },
      ],
      durante: [
        { icon: '⚡', title: 'Desligue a energia', text: 'Desligue o disjuntor geral e feche o gás antes de a água entrar.' },
        { icon: '⬆️', title: 'Vá para o alto', text: 'Saia cedo para um local alto. Não espere a água subir.' },
        { icon: '🚫', title: 'Não atravesse', text: 'Nunca entre em rua alagada a pé ou de carro: a correnteza derruba e arrasta.' },
        { icon: '🔌', title: 'Longe da fiação', text: 'Fique longe de postes e fios. A água conduz eletricidade.' },
        { icon: '📞', title: 'Peça ajuda', text: 'Em perigo, ligue 193 (Bombeiros) ou 199 (Defesa Civil).' },
      ],
      depois: [
        { icon: '✅', title: 'Espere a liberação', text: 'Só volte para casa quando a Defesa Civil liberar.' },
        { icon: '🧤', title: 'Botas e luvas', text: 'A água da enchente pode transmitir leptospirose. Proteja-se ao limpar.' },
        { icon: '🧴', title: 'Limpe com água sanitária', text: 'Lave pisos, paredes e objetos com água sanitária.' },
        { icon: '🍞', title: 'Descarte alimentos', text: 'Jogue fora comida e remédios que tocaram na água.' },
        { icon: '💡', title: 'Energia com cuidado', text: 'Só religue a energia depois de um eletricista verificar.' },
      ],
    },
    quiz: [
      {
        q: 'A água está subindo na sua rua. O que fazer?',
        options: ['Esperar para ver se para de subir', 'Ir logo para um local alto e seguro', 'Subir no telhado do carro'],
        answer: 1,
        why: 'Sair cedo é o mais seguro. Esperar pode deixar você ilhado.',
      },
      {
        q: 'Dá para atravessar a rua alagada de carro se a água estiver baixa?',
        options: ['Sim, devagar dá', 'Só se for caminhonete', 'Não! Correnteza e buracos escondidos arrastam carros'],
        answer: 2,
        why: 'Pouca água em movimento já arrasta um carro. Procure outro caminho.',
      },
      {
        q: 'Antes de a água entrar em casa, você deve…',
        options: ['Desligar o disjuntor geral', 'Ligar todos os aparelhos', 'Abrir o registro de gás'],
        answer: 0,
        why: 'Desligar a energia evita choques e curtos-circuitos.',
      },
    ],
  },
  {
    id: 'tempestade',
    emoji: '⛈️',
    title: 'Tempestades e vendavais',
    short: 'Vento, raios e granizo',
    tone: 'from-violet-500/25 to-indigo-500/5 border-violet-400/30',
    intro: 'Vento forte, raios e granizo chegam de repente. Vamos nos preparar!',
    phases: {
      antes: [
        { icon: '🪴', title: 'Prenda objetos', text: 'Guarde ou amarre vasos, telhas soltas e objetos do quintal.' },
        { icon: '🌳', title: 'Árvores e telhado', text: 'Peça à prefeitura a poda de árvores perto da casa e da rede elétrica.' },
        { icon: '🔋', title: 'Carregue tudo', text: 'Deixe celular e carregador portátil com bateria cheia.' },
        { icon: '📻', title: 'Fique informado', text: 'Acompanhe o radar e os avisos do INMET e da Defesa Civil.' },
      ],
      durante: [
        { icon: '🏠', title: 'Fique abrigado', text: 'Fique dentro de casa, longe de portas e janelas de vidro.' },
        { icon: '🔌', title: 'Tire da tomada', text: 'Desligue aparelhos da tomada e evite banho no chuveiro elétrico durante raios.' },
        { icon: '🌲', title: 'Nunca sob árvores', text: 'Na rua, não se abrigue sob árvores, postes, placas ou torres.' },
        { icon: '🚗', title: 'No carro', text: 'Pare longe de árvores e fios e fique dentro, com os vidros fechados.' },
        { icon: '⚡', title: 'Ouviu trovão?', text: 'Se dá para ouvir o trovão, o raio pode chegar até você. Entre!' },
      ],
      depois: [
        { icon: '⚠️', title: 'Fio no chão', text: 'Não toque em fios caídos. Avise a companhia de energia.' },
        { icon: '⏱️', title: 'Espere 30 minutos', text: 'Aguarde 30 min depois do último trovão para sair.' },
        { icon: '🪜', title: 'Telhado com cuidado', text: 'Não suba no telhado molhado ou com vento. Peça ajuda.' },
        { icon: '📸', title: 'Registre danos', text: 'Fotografe os estragos e informe a Defesa Civil (199).' },
      ],
    },
    quiz: [
      {
        q: 'Começou a trovejar e você está no campo. Onde se proteger?',
        options: ['Debaixo de uma árvore alta', 'Dentro de uma construção ou carro fechado', 'No meio do campo, em pé'],
        answer: 1,
        why: 'Árvores atraem raios. Construções e carros fechados protegem.',
      },
      {
        q: 'Durante o temporal, é seguro…',
        options: ['Tomar banho no chuveiro elétrico', 'Ficar perto da janela olhando', 'Ficar em um cômodo interno, longe do vidro'],
        answer: 2,
        why: 'Vidros podem quebrar com vento e granizo. Cômodos internos são mais seguros.',
      },
      {
        q: 'Viu um fio de energia caído na calçada. O que fazer?',
        options: ['Afastar com um pedaço de pau', 'Manter distância e avisar a companhia de energia', 'Passar por cima rapidinho'],
        answer: 1,
        why: 'Fio caído pode estar energizado. Fique longe e chame a concessionária.',
      },
    ],
  },
  {
    id: 'deslizamento',
    emoji: '⛰️',
    title: 'Deslizamentos de terra',
    short: 'Encostas e morros',
    tone: 'from-orange-500/25 to-amber-500/5 border-orange-400/30',
    intro: 'Chuva por muitas horas encharca o solo das encostas. Fique de olho nos sinais!',
    phases: {
      antes: [
        { icon: '🔍', title: 'Observe os sinais', text: 'Trincas no chão e nas paredes, portas emperrando, muros e árvores inclinados.' },
        { icon: '💧', title: 'Água minando', text: 'Água brotando do barranco ou ficando barrenta é sinal de perigo.' },
        { icon: '🌱', title: 'Proteja a encosta', text: 'Não corte árvores nem faça cortes no barranco. Grama ajuda a segurar o solo.' },
        { icon: '🗑️', title: 'Nada de lixo', text: 'Não jogue lixo nem água de esgoto na encosta.' },
        { icon: '📞', title: 'Peça vistoria', text: 'Viu sinais? Ligue 199 e peça uma vistoria da Defesa Civil.' },
      ],
      durante: [
        { icon: '🏃', title: 'Saia de casa', text: 'Se mora em área de risco e chove forte por horas, vá para um local seguro.' },
        { icon: '👂', title: 'Ouça a terra', text: 'Estalos, barulho de árvores quebrando ou rolar de pedras: saia na hora!' },
        { icon: '↔️', title: 'Fuja para os lados', text: 'Afaste-se para fora do caminho da terra, nunca na mesma direção.' },
        { icon: '📢', title: 'Avise os vizinhos', text: 'Alerte quem mora perto e ligue 193 ou 199.' },
      ],
      depois: [
        { icon: '🚧', title: 'Fique longe', text: 'Novos deslizamentos podem acontecer. Não volte ao local.' },
        { icon: '🏚️', title: 'Vistoria antes', text: 'Só entre em casa após a Defesa Civil avaliar a estrutura.' },
        { icon: '🚒', title: 'Resgate é com os Bombeiros', text: 'Pessoas soterradas? Ligue 193 e indique o local, sem se arriscar.' },
      ],
    },
    quiz: [
      {
        q: 'Qual destes é um sinal de deslizamento?',
        options: ['Portas e janelas emperrando de repente', 'Céu sem nuvens', 'Vento fraco'],
        answer: 0,
        why: 'O terreno se mexendo entorta a casa e emperra portas e janelas.',
      },
      {
        q: 'Você ouve estalos e árvores quebrando no morro. O que fazer?',
        options: ['Ir até lá ver o que é', 'Sair imediatamente para um local seguro', 'Fechar as janelas e ficar'],
        answer: 1,
        why: 'Esses sons podem indicar terra em movimento. Saia na hora!',
      },
      {
        q: 'Para onde correr num deslizamento?',
        options: ['Morro abaixo, na mesma direção da terra', 'Para os lados, fora do caminho', 'Para dentro de casa'],
        answer: 1,
        why: 'Sair lateralmente tira você do caminho da terra.',
      },
    ],
  },
  {
    id: 'incendio',
    emoji: '🔥',
    title: 'Incêndios florestais e urbanos',
    short: 'Fogo e fumaça',
    tone: 'from-rose-500/25 to-red-500/5 border-rose-400/30',
    intro: 'No tempo seco, o fogo se espalha muito rápido. Prevenção é tudo!',
    phases: {
      antes: [
        { icon: '🚭', title: 'Não queime', text: 'Não queime lixo nem faça queimadas. Não jogue bitucas de cigarro.' },
        { icon: '🌾', title: 'Terreno limpo', text: 'Mantenha o terreno ao redor da casa sem mato seco.' },
        { icon: '🧯', title: 'Extintor', text: 'Tenha extintor e aprenda a usar. Confira botijão e mangueira de gás.' },
        { icon: '🚪', title: 'Plano de fuga', text: 'Combine com a família duas saídas da casa e um ponto de encontro.' },
      ],
      durante: [
        { icon: '📞', title: 'Ligue 193', text: 'Chame os Bombeiros assim que vir fogo ou muita fumaça.' },
        { icon: '🧎', title: 'Abaixe-se', text: 'Com fumaça, saia abaixado: o ar perto do chão é mais limpo.' },
        { icon: '✋', title: 'Teste a porta', text: 'Toque a porta com as costas da mão. Se estiver quente, não abra.' },
        { icon: '🍳', title: 'Óleo na panela', text: 'Panela pegando fogo: desligue e tampe. Nunca jogue água!' },
        { icon: '🌬️', title: 'Fogo no mato', text: 'Afaste-se contra o vento, por estradas ou áreas abertas sem vegetação.' },
      ],
      depois: [
        { icon: '🚒', title: 'Espere a liberação', text: 'Só entre no local quando os Bombeiros liberarem.' },
        { icon: '🔥', title: 'Brasas escondidas', text: 'Brasas podem reacender. Não mexa nos restos queimados.' },
        { icon: '😷', title: 'Cuide da respiração', text: 'Falta de ar ou tosse forte após a fumaça? Procure atendimento (192).' },
      ],
    },
    quiz: [
      {
        q: 'A panela com óleo pegou fogo. O que fazer?',
        options: ['Jogar água', 'Desligar o fogão e tampar a panela', 'Levar a panela para fora correndo'],
        answer: 1,
        why: 'Água espalha o óleo em chamas. Tampar abafa o fogo.',
      },
      {
        q: 'O quarto está cheio de fumaça. Como sair?',
        options: ['Em pé, correndo', 'Abaixado, perto do chão', 'Pelo elevador'],
        answer: 1,
        why: 'A fumaça sobe. Perto do chão o ar é mais respirável.',
      },
      {
        q: 'Antes de abrir uma porta durante um incêndio, você…',
        options: ['Toca a porta com as costas da mão', 'Abre de uma vez', 'Chuta a porta'],
        answer: 0,
        why: 'Porta quente indica fogo do outro lado. Procure outra saída.',
      },
    ],
  },
];

/** Itens do mini jogo "Monte sua mochila de emergência". */
export interface KitItem {
  id: string;
  icon: string;
  label: string;
  good: boolean;
  tip: string;
}

export const KIT_ITEMS: KitItem[] = [
  { id: 'agua', icon: '💧', label: 'Água potável', good: true, tip: 'Água para pelo menos 3 dias!' },
  { id: 'comida', icon: '🥫', label: 'Comida não perecível', good: true, tip: 'Enlatados e biscoitos duram bastante.' },
  { id: 'lanterna', icon: '🔦', label: 'Lanterna e pilhas', good: true, tip: 'Muito mais segura que vela!' },
  { id: 'docs', icon: '📄', label: 'Documentos no plástico', good: true, tip: 'Protegidos da água, prontos para usar.' },
  { id: 'remedios', icon: '💊', label: 'Remédios e receitas', good: true, tip: 'Principalmente os de uso contínuo.' },
  { id: 'socorros', icon: '🩹', label: 'Primeiros socorros', good: true, tip: 'Curativos, gaze e antisséptico.' },
  { id: 'powerbank', icon: '🔋', label: 'Carregador portátil', good: true, tip: 'Para o celular não ficar sem bateria.' },
  { id: 'radio', icon: '📻', label: 'Rádio a pilha', good: true, tip: 'Funciona mesmo sem energia e internet.' },
  { id: 'roupas', icon: '🧥', label: 'Roupa e capa de chuva', good: true, tip: 'Seco e quentinho, igual gato gosta!' },
  { id: 'apito', icon: '📣', label: 'Apito', good: true, tip: 'Ajuda as equipes de resgate a te encontrar.' },
  { id: 'dinheiro', icon: '💵', label: 'Dinheiro trocado', good: true, tip: 'Sem energia, cartão pode não funcionar.' },
  { id: 'contatos', icon: '📒', label: 'Contatos no papel', good: true, tip: 'Telefones importantes anotados.' },
  { id: 'videogame', icon: '🎮', label: 'Videogame', good: false, tip: 'Pesa e gasta bateria. Deixa em casa!' },
  { id: 'vela', icon: '🕯️', label: 'Velas', good: false, tip: 'Vela pode causar incêndio. Prefira a lanterna.' },
  { id: 'secador', icon: '💨', label: 'Secador de cabelo', good: false, tip: 'Sem energia ele não serve para nada.' },
  { id: 'vaso', icon: '🪴', label: 'Vaso de planta', good: false, tip: 'Bonito, mas só pesa na mochila.' },
];

/** Dicas rápidas do balão de fala (ações aleatórias). */
export const QUICK_TIPS: string[] = [
  'Lembre-se de checar a previsão do tempo! ☁️',
  'Mantenha uma lanterna por perto! 🔦',
  'Envie seu CEP por SMS para 40199 e receba alertas da Defesa Civil.',
  'Rua alagada? Nunca atravesse! 🚫🌊',
  'Ouviu trovão? Procure abrigo. ⚡',
  'Deixe o celular carregado em dias de temporal. 🔋',
  'Documentos em saco plástico, bem no alto! 📄',
  'Árvore não é abrigo durante raios! 🌳⚡',
  'Trincas novas na parede? Ligue 199. 🔍',
  'Não queime lixo: o fogo se espalha rápido. 🔥',
  'Combine um ponto de encontro com a família. 🏠',
  'Toque em mim para aprender a se proteger! 🐾',
  'Bombeiros: 193 · Defesa Civil: 199 · SAMU: 192',
  'Monte sua mochila de emergência! 🎒',
];

export const EMERGENCY_NUMBERS = [
  { number: '199', label: 'Defesa Civil' },
  { number: '193', label: 'Bombeiros' },
  { number: '192', label: 'SAMU' },
  { number: '190', label: 'Polícia' },
];

export const CHEERS = ['Isso aí! 😺', 'Mandou bem! 🐾', 'Miau, perfeito! ✨', 'Aprendeu rapidinho!', 'Que orgulho! 😸'];
export const OOPS = ['Hmm, quase! 🙀', 'Ops, esse não…', 'Vamos tentar entender juntos.'];
