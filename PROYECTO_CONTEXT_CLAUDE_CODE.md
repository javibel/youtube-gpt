# 📋 CONTEXTO PROYECTO YouTubeGPT - CLAUDE CODE

## 🎯 VISIÓN GENERAL

**YouTubeGPT** es una SaaS para generar contenido viral para YouTubers.

**URL Producción:** https://youtube-gpt-alpha.vercel.app/

**GitHub:** https://github.com/javibel/youtube-gpt

**Stack:**
- Frontend: Next.js 16 + React + Tailwind CSS
- Backend: Node.js API routes
- BD: PostgreSQL (Neon)
- ORM: Prisma
- Auth: NextAuth.js (beta)
- Pagos: Stripe (NO INTEGRADO AÚN)
- AI: Claude API (usuario proporciona su key)
- Deploy: Vercel

---

## 📊 ESTADO ACTUAL

### ✅ FUNCIONANDO (EN PRODUCCIÓN)

1. **Generador de Contenido - 100% FUNCIONAL**
   - 5 templates: Títulos, Descripciones, Captions, Thumbnails, Scripts
   - Usuario ingresa su API key de Claude
   - Genera contenido en segundos
   - UI hermosa con gradientes y animaciones

2. **Límite Freemium - 100% FUNCIONAL**
   - 10 generaciones/mes para usuarios gratis
   - Contador visible en header
   - Se resetea mensualmente (localStorage)
   - Paywall aparece en generación 11+

3. **Deploy en Vercel - 100% FUNCIONAL**
   - App accesible en https://youtube-gpt-alpha.vercel.app/
   - Auto-deploy desde GitHub main branch
   - Vercel actualiza cada vez que haces push

### 🟡 PARCIALMENTE FUNCIONAL (CON BUGS)

1. **Autenticación NextAuth - 50% FUNCIONAL**
   - ✅ NextAuth instalado
   - ✅ route.ts existe: `app/api/auth/[...nextauth]/route.ts`
   - ❌ **BUG CRÍTICO:** Login devuelve 404
   - ❌ SessionProvider agregado a layout pero no funciona
   - ❌ Credenciales hardcodeadas (test@test.com / 123456)

2. **Páginas de Auth - 50% FUNCIONAL**
   - ✅ `/login` - Página creada
   - ✅ `/signup` - Página creada  
   - ✅ `/dashboard` - Página creada
   - ❌ No se redirigen correctamente
   - ❌ No hay validación real de sesión

3. **Base de Datos - 80% FUNCIONAL**
   - ✅ Neon PostgreSQL conectada
   - ✅ Prisma configurado y migrado
   - ✅ Schema completo creado (users, accounts, sessions, generations, subscriptions)
   - ❌ **NO INTEGRADA CON UI:** Las páginas no guardan/leen de la BD
   - ❌ Login no valida contra users table

### ❌ NO IMPLEMENTADO

1. **Stripe - 0% IMPLEMENTADO**
   - No hay rutas de checkout
   - No hay webhook de Stripe
   - No hay lógica de suscripción
   - No hay integración con BD subscription model

2. **Analytics Dashboard - 0% IMPLEMENTADO**
   - Dashboard existe pero solo muestra datos hardcodeados (0)
   - No hay gráficos
   - No hay historial de generaciones

3. **Integración YouTube API - 0% IMPLEMENTADO**
   - Auto-publish directo a YouTube no existe

---

## 🐛 BUGS CRÍTICOS

### BUG #1: NextAuth Login 404
**Ubicación:** `/login` page
**Síntoma:** Al ingresar credenciales, devuelve error 404
**Causa:** 
```
Error: GET /api/auth/session 500
Error: "Cannot find name 'div'"
```
**Solución Requerida:**
- Revisar `app/api/auth/[...nextauth]/route.ts`
- Validar que SessionProvider esté en layout
- Revisar imports en route.ts

### BUG #2: BD No Conectada a Autenticación
**Ubicación:** `app/api/auth/[...nextauth]/route.ts`
**Síntoma:** Las credenciales están hardcodeadas (test@test.com / 123456)
**Causa:** Route.ts NO usa Prisma para validar contra users table
**Solución Requerida:**
```typescript
// ACTUALIZAR authorize() para usar:
const user = await prisma.user.findUnique({
  where: { email: credentials.email }
});
const passwordMatch = await bcrypt.compare(credentials.password, user.password);
```

### BUG #3: SessionProvider Error
**Ubicación:** `app/layout.tsx`
**Síntoma:** Error de sesión al intentar usar useSession()
**Causa:** SessionProvider tiene mal la estructura
**Solución Requerida:**
```typescript
<SessionProvider>
  {children}
</SessionProvider>
```

### BUG #4: Rutas No Protegidas
**Ubicación:** `/dashboard`
**Síntoma:** Cualquiera puede acceder sin login
**Causa:** No hay middleware de protección
**Solución Requerida:** Agregar middleware en `middleware.ts`

---

## 🗄️ ESTRUCTURA DE CARPETAS

```
youtube-gpt/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   └── [...nextauth]/
│   │   │       └── route.ts (❌ CON BUGS)
│   │   └── generate/
│   │       └── route.ts (✅ FUNCIONA)
│   ├── login/
│   │   └── page.tsx (🟡 CON BUGS)
│   ├── signup/
│   │   └── page.tsx (🟡 CON BUGS)
│   ├── dashboard/
│   │   └── page.tsx (🟡 CON BUGS)
│   ├── layout.tsx (🟡 SessionProvider)
│   └── page.tsx (✅ FUNCIONA - generador)
├── components/
│   ├── TemplateSelector.jsx (✅)
│   ├── InputForm.jsx (✅)
│   ├── OutputDisplay.jsx (✅)
│   └── PaywallModal.jsx (✅ CREADO pero no integrado)
├── utils/
│   ├── prompts.js (✅)
│   └── claudeAPI.js (✅)
├── lib/
│   └── prisma.ts (✅)
├── prisma/
│   └── schema.prisma (✅ COMPLETO)
├── .env.local (✅ CON BD URL y NextAuth secret)
├── package.json (✅)
└── tsconfig.json (✅)
```

---

## 🎯 OBJETIVOS INMEDIATOS (PRÓXIMAS 24 HORAS)

### PRIORIDAD 1 - CRÍTICO: Arreglar NextAuth (2-3 horas)

**Objetivo:** Login/Signup funcional que guarde usuarios en BD

**Tareas:**
1. ✅ Revisar `route.ts` - exporta GET/POST correctamente
2. ✅ Integrar Prisma en authorize()
3. ✅ Implementar bcrypt para hasear contraseñas
4. ✅ Validar SessionProvider en layout
5. ✅ Probar login/signup en local
6. ✅ Deploy a Vercel

**Archivos a modificar:**
- `app/api/auth/[...nextauth]/route.ts` - REESCRIBIR COMPLETAMENTE
- `app/layout.tsx` - Validar SessionProvider
- `app/login/page.tsx` - Revisar signIn() call
- `app/signup/page.tsx` - Agregar creación de usuario en BD

### PRIORIDAD 2 - IMPORTANTE: Conectar BD a Dashboard (1-2 horas)

**Objetivo:** Dashboard muestre datos reales del usuario

**Tareas:**
1. Agregar query de generaciones del usuario
2. Mostrar contador real de generaciones
3. Mostrar fecha de siguiente reset
4. Mostrar plan actual (GRATIS vs PRO)

**Archivos a modificar:**
- `app/dashboard/page.tsx` - Agregar data fetching
- `app/api/user/stats/route.ts` - CREAR nuevo endpoint

### PRIORIDAD 3 - IMPORTANTE: Agregar Middleware de Protección (30 min)

**Objetivo:** Solo usuarios autenticados pueden acceder a `/dashboard`

**Tareas:**
1. Crear `middleware.ts` en raíz
2. Proteger `/dashboard`
3. Redirigir a `/login` si no autenticado

**Archivos a crear:**
- `middleware.ts`

### PRIORIDAD 4 - DESEABLE: Guardar Generaciones en BD (1 hora)

**Objetivo:** Cada generación se guarde con userId, template, inputs, output

**Tareas:**
1. Modificar `/api/generate` para guardar en BD
2. Incluir tokensUsed en la grabación
3. Usar para analytics

**Archivos a modificar:**
- `app/api/generate/route.ts` - Agregar Prisma save

---

## 💻 VARIABLES DE ENTORNO (.env.local)

```
# BD
DATABASE_URL=postgresql://neondb_owner:TU_PASSWORD@ep-noisy-scene-abzn9kdy.eu-west-2.aws.neon.tech/neondb?sslmode=require
DATABASE_URL_DIRECT=postgresql://neondb_owner:TU_PASSWORD@ep-noisy-scene-abzn9kdy.eu-west-2.aws.neon.tech/neondb?sslmode=require

# NextAuth
NEXTAUTH_SECRET=youtube-gpt-secret-key-2024-random-string-12345
NEXTAUTH_URL=http://localhost:3000

# Stripe (FALTA)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
STRIPE_SECRET_KEY=sk_test_xxxxx
```

---

## 📦 DEPENDENCIAS INSTALADAS

```
next@16.2.2
react@19
next-auth@5.0.0-beta.30
prisma@5.8.0
@prisma/client@5.8.0
bcryptjs
tailwindcss
```

---

## 🔐 SCHEMA PRISMA (BD)

```prisma
model User {
  id String @id @default(cuid())
  email String @unique
  name String?
  password String?
  createdAt DateTime @default(now())
  
  sessions Session[]
  generations Generation[]
  subscription Subscription?
}

model Generation {
  id String @id @default(cuid())
  userId String
  template String (título, description, caption, etc)
  inputs Json
  output String
  tokensUsed Int
  createdAt DateTime @default(now())
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Subscription {
  id String @id @default(cuid())
  userId String @unique
  status String (active, cancelled, etc)
  currentPeriodEnd DateTime?
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

---

## 🚀 CÓMO CORRER LOCALMENTE

```bash
# Install deps
npm install

# BD
npx prisma db push

# Dev
npm run dev

# Build
npm run build
```

---

## 📈 ROADMAP SIGUIENTE

**Después de arreglar NextAuth:**

1. **Stripe Integration** (2-3 horas)
   - Crear checkout session
   - Webhook para confirmar pagos
   - Actualizar subscription en BD

2. **Analytics Dashboard** (2 horas)
   - Gráfico de generaciones por día
   - Histórico de contenidos generados
   - Exportar a CSV

3. **Optimizaciones** (1-2 horas)
   - Caché de generaciones
   - Rate limiting mejorado
   - Email notifications

4. **Marketing** (1 semana)
   - ProductHunt launch
   - Twitter marketing
   - Primeros usuarios pagos

---

## 🎓 NOTAS IMPORTANTES PARA CLAUDE CODE

1. **Usuario proporciona API key de Claude**
   - NO hardcodear keys en código
   - Validar formato `sk-ant-*`
   - Guardar temporalmente en sesión

2. **BD está ON pero no integrada**
   - Prisma está configurado y funciona
   - Pero las páginas no la usan
   - Prioridad: conectar login con prisma.user

3. **NextAuth versión beta**
   - Algunos tipos pueden estar deprecados
   - Usar `any` type si es necesario
   - Focus en funcionalidad sobre tipos

4. **TypeScript está relajado**
   - Muchos `any` types para prototipado rápido
   - Revisar después cuando todo funcione

5. **Vercel auto-deploya**
   - Cada `git push` actualiza producción
   - Revisar logs en vercel.com si falla

---

## ✅ CHECKLIST PARA ARREGLAR

- [ ] NextAuth route.ts exporta correctamente
- [ ] SessionProvider funciona en layout
- [ ] Login valida contra users en BD
- [ ] Signup crea usuario en BD con contraseña hasheada
- [ ] `/dashboard` está protegido
- [ ] Dashboard muestra datos reales del usuario
- [ ] Generaciones se guardan en tabla generations
- [ ] Todo funciona en local
- [ ] Push a GitHub
- [ ] Vercel actualiza sin errores
- [ ] Testear en https://youtube-gpt-alpha.vercel.app/

---

**ÚLTIMA ACTUALIZACIÓN:** Abril 11, 2026
**ESTADO:** 80% completado, 20% bugs críticos de auth
**PRÓXIMO PASO:** Arreglar NextAuth completamente
