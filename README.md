# KSD · KūSō · Sueño · Dream

Aplicación privada de planificación de viajes para 2 personas.

## Siguientes pasos

### 1. Configurar .env.local

```bash
cp .env.local.example .env.local
```

Editá `.env.local` con tus keys desde:
https://supabase.com/dashboard/project/xxfwplvicgpkjmuypmvq/settings/api

### 2. Configurar Auth en Supabase

En el dashboard del proyecto:

**Authentication → Providers → Email:**
- Enable Email provider ✅
- DESHABILITAR "Enable Sign-ups" ❌

**Authentication → Users → "Invite user":**
- Invitá tu email + el de tu novia

### 3. Probar en local

```bash
npm run dev
```

Abrí http://localhost:5173 → login con magic link.

### 4. Deploy a Vercel

```bash
git init
git add .
git commit -m "init"
# crear repo privado en github
git remote add origin https://github.com/tu-user/ksd-app.git
git push -u origin main
```

En [vercel.com/new](https://vercel.com/new):
1. Import Git Repository
2. Framework preset: Vite (auto)
3. Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
4. Deploy

### 5. Post-deploy

Cuando tengas la URL de Vercel (ej: `https://ksd-xxxxx.vercel.app`):

**Authentication → URL Configuration:**
- Site URL: tu URL de Vercel
- Redirect URLs: `https://ksd-xxxxx.vercel.app/**` + `http://localhost:5173/**`
