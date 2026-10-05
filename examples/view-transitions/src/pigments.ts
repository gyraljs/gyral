// The data: a dozen pigments as OKLCH colours, and the orders the gallery can show them in.

export interface Pigment {
  readonly id: string;
  readonly name: string;
  /** OKLCH lightness 0..1, chroma, hue in degrees. */
  readonly l: number;
  readonly c: number;
  readonly h: number;
  readonly note: string;
}

export const PIGMENTS: readonly Pigment[] = [
  {
    id: 'ultramarine',
    name: 'Ultramarine',
    l: 0.45,
    c: 0.2,
    h: 268,
    note: 'Once ground from lapis lazuli and worth more than gold.',
  },
  {
    id: 'vermilion',
    name: 'Vermilion',
    l: 0.62,
    c: 0.21,
    h: 35,
    note: 'The red of lacquerware and medieval manuscripts.',
  },
  {
    id: 'viridian',
    name: 'Viridian',
    l: 0.55,
    c: 0.1,
    h: 170,
    note: 'A cool, transparent green that painters glaze with.',
  },
  {
    id: 'ochre',
    name: 'Yellow ochre',
    l: 0.72,
    c: 0.14,
    h: 80,
    note: 'Earth pigment: the oldest colour humans painted with.',
  },
  {
    id: 'cerulean',
    name: 'Cerulean',
    l: 0.65,
    c: 0.12,
    h: 235,
    note: 'The soft blue of a clear sky near the horizon.',
  },
  {
    id: 'magenta',
    name: 'Magenta',
    l: 0.6,
    c: 0.25,
    h: 345,
    note: 'Named after a battle in 1859, the year the dye appeared.',
  },
  {
    id: 'saffron',
    name: 'Saffron',
    l: 0.82,
    c: 0.16,
    h: 85,
    note: 'A spice before it was a colour.',
  },
  {
    id: 'teal',
    name: 'Teal',
    l: 0.55,
    c: 0.09,
    h: 200,
    note: 'Named after the stripe on a small duck’s head.',
  },
  {
    id: 'crimson',
    name: 'Crimson',
    l: 0.5,
    c: 0.2,
    h: 20,
    note: 'Made from insects, kermes and later cochineal.',
  },
  {
    id: 'chartreuse',
    name: 'Chartreuse',
    l: 0.85,
    c: 0.2,
    h: 125,
    note: 'After the liqueur made by Carthusian monks.',
  },
  {
    id: 'indigo',
    name: 'Indigo',
    l: 0.38,
    c: 0.15,
    h: 285,
    note: 'The dye of blue jeans, from the indigo plant.',
  },
  {
    id: 'coral',
    name: 'Coral',
    l: 0.72,
    c: 0.14,
    h: 30,
    note: 'A warm pink-orange, like the reef it is named after.',
  },
];

export const ORDERS = ['name', 'hue', 'lightness'] as const;
export type Order = (typeof ORDERS)[number];

export const isOrder = (value: string | undefined): value is Order =>
  (ORDERS as readonly (string | undefined)[]).includes(value);

const by: Readonly<Record<Order, (a: Pigment, b: Pigment) => number>> = {
  name: (a, b) => a.name.localeCompare(b.name),
  hue: (a, b) => a.h - b.h,
  lightness: (a, b) => b.l - a.l,
};

/** The pigments in `order`, reversed when `reversed`. Never mutates PIGMENTS. */
export function sorted(order: Order, reversed: boolean): readonly Pigment[] {
  const list = [...PIGMENTS].sort(by[order]);
  return reversed ? list.reverse() : list;
}

export const css = (p: Pigment): string =>
  `oklch(${String(Math.round(p.l * 100))}% ${String(p.c)} ${String(p.h)})`;

export const findPigment = (id: string | undefined): Pigment | undefined =>
  PIGMENTS.find((p) => p.id === id);
