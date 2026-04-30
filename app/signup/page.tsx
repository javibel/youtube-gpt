import type { Metadata } from 'next';
import SignupForm from './SignupForm';

export const metadata: Metadata = {
  title: 'Crear cuenta gratis — YTubViral',
  description:
    'Regístrate gratis en YTubViral y empieza a generar títulos virales, descripciones SEO, scripts y miniaturas para YouTube con IA.',
  alternates: { canonical: 'https://ytubviral.com/signup' },
};

export default function SignupPage() {
  return <SignupForm />;
}
