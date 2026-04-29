export function validatePassword(password: string, lang: 'es' | 'en' = 'es'): string | null {
  if (password.length < 10) {
    return lang === 'en'
      ? 'Password must be at least 10 characters'
      : 'La contraseña debe tener al menos 10 caracteres';
  }
  if (!/[a-z]/.test(password)) {
    return lang === 'en'
      ? 'Password must contain at least one lowercase letter'
      : 'La contraseña debe contener al menos una letra minúscula';
  }
  if (!/[A-Z]/.test(password)) {
    return lang === 'en'
      ? 'Password must contain at least one uppercase letter'
      : 'La contraseña debe contener al menos una letra mayúscula';
  }
  if (!/[0-9]/.test(password)) {
    return lang === 'en'
      ? 'Password must contain at least one number'
      : 'La contraseña debe contener al menos un número';
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    return lang === 'en'
      ? 'Password must contain at least one special character'
      : 'La contraseña debe contener al menos un carácter especial';
  }
  return null;
}
