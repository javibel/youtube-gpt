// Cuentas internas / de prueba — NUNCA reciben emails de marketing (G4).
// Confirmadas por Javier 2026-06-13. Añadir aquí cualquier cuenta de test futura.
const INTERNAL_EMAILS = new Set<string>([
  'javibel214@gmail.com',
  'javibel@yahoo.com',
  'jimeno_plata@yahoo.es',
  'ytbeviral@gmail.com',      // Gmail de la marca/soporte
  'cwsdcrtest@gmail.com',     // QA
  'cwsctsqa@gmail.com',       // QA
  'antibrg01@blogerspace.com',// correo temporal
  'gorgeous1@web-library.net',// correo temporal
]);

export function isInternalAccount(email: string | null | undefined): boolean {
  if (!email) return false;
  return INTERNAL_EMAILS.has(email.trim().toLowerCase());
}
