export function validatePassword(password: string, lang: 'es' | 'en' = 'es'): string | null {
  if (password.length < 8) {
    return lang === 'en' ? 'Password must be at least 8 characters' : 'La contraseña debe tener al menos 8 caracteres';
  }
  if (!/[a-zA-Z]/.test(password)) {
    return lang === 'en' ? 'Password must contain at least one letter' : 'La contraseña debe contener al menos una letra';
  }
  if (!/[0-9]/.test(password)) {
    return lang === 'en' ? 'Password must contain at least one number' : 'La contraseña debe contener al menos un número';
  }
  return null;
}
