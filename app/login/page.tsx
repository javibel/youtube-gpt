import type { Metadata } from 'next';
import LoginForm from './LoginForm';

export const metadata: Metadata = {
  title: 'Iniciar sesión — YTubViral',
  description:
    'Accede a tu cuenta de YTubViral para generar contenido viral para YouTube con inteligencia artificial.',
  alternates: { canonical: 'https://ytubviral.com/login' },
};

export default function LoginPage() {
  return <LoginForm />;
}
