// Polyfill minimi per pdfjs (usato da pdf-parse) in ambiente serverless.
// Servono solo al rendering grafico, che non usiamo: a noi basta
// l'estrazione del testo. Stub innocui per far caricare il modulo.
/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;
g.DOMMatrix ??= class DOMMatrix {};
g.ImageData ??= class ImageData {};
g.Path2D ??= class Path2D {};

export {};
