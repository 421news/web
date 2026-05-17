# 421 NFT Collection — Contexto del proyecto

## Objetivo

Crear una colección de NFTs coleccionables y simbólicos: **tirada total de 300 NFTs, edición única** ("Miércoles de magos", mismo arte × 300, numerados #1/300 a #300/300). Los suscriptores activos pagos pueden reclamar gratis su carta foil estilo Magic/Pokémon desde una página de mint en el sitio, conectando su wallet y haciendo un solo click.

### Distribución
- **Suscriptores activos: ~233** (228 MP + 5 Stripe)
  - **Anuales** claim con **prioridad** durante ventana inicial
  - **Mensuales** claim en segunda ventana o si quedan cupos
- **Reserva**: lo que sobre de 300 después del claim → queda disponible para futuros suscriptores. Funciona como **incentivo a suscribirse ahora**: "Si todavía no sos Mago, hay un cupo limitado para vos."

## Decisiones tomadas

- **Blockchain**: Solana (descartado Ethereum L1 por costos de gas prohibitivos para 300 mints simbólicos; descartada Base como intermedia porque la diferencia de costo y velocidad no compensa para este caso).
- **Tipo de colección**: simbólica, pura coleccionable, sin utility (sin desbloquear contenido ni descuentos). Posibilidad de extender utility en el futuro.
- **Tirada**: 300 NFTs, **edición única** ("Miércoles de magos", mismo arte × 300, numerados #1/300 — #300/300).
- **Reserva**: los NFTs no claimeados quedan para futuros suscriptores (incentivo).
- **Prioridad de claim**: anuales primero (ventana inicial), mensuales después o en paralelo si quedan.
- **Mint**: token-gated, el usuario mintea él mismo (no airdrop). Suscriptor paga solo el fee de red de Solana (~$0.001).
- **UX target**: el usuario conecta wallet **Phantom**, click en MINT, NFT en su wallet. Sin pasos intermedios, sin marketplace de terceros.
- **Crossmint / email-wallets**: NO se soporta. Los suscriptores sin wallet tienen que instalar Phantom (proveeremos instrucciones).
- **Transferibilidad**: NO soulbound. La NFT es **transferible y vendible** desde el día 0.
- **Royalties**: **0%**. Sin fees al revender. Regalo a los Magos, lo que hagan después es asunto suyo.
- **Audiencia**: mitad cripto-nativa, mitad no — los no-nativos tendrán que instalar Phantom (decisión consciente para mantener simplicidad técnica y self-custody).

## Arquitectura propuesta

Tres componentes:

1. **Frontend** (página en 421.news/mint o similar)
   - `@solana/wallet-adapter-react` + `@solana/wallet-adapter-wallets` para conexión de wallet
   - Botón "Conectar wallet" + botón "MINT"
   - Estados de loading, success, error
   - Opcional: integración con Crossmint para usuarios sin wallet

2. **Backend** (endpoint en 421.news)
   - Verifica suscripción activa del usuario (chequear contra DB de Ghost / sistema de suscripción actual)
   - Verifica que el usuario no haya claimeado ya
   - Firma un token de allowlist o agrega la wallet al Merkle tree del Candy Machine
   - Stack sugerido: Node.js, integrado con el server.js existente

3. **On-chain** (Solana)
   - **Candy Machine v3** de Metaplex con allowlist guard
   - **Metaplex Core** para las NFTs (más barato y moderno que Token Metadata clásico)
   - Metadata y arte en **Arweave** (permanente)
   - Precio del mint: 0 SOL (gratuito), usuario paga solo network fee

## Estado actual de los archivos

En `/Users/juan/Library/CloudStorage/Dropbox/03_claude/421-web/nft/`:

- `421-card-3d.html` — visor 3D interactivo de la carta con efecto foil (girable, con espesor, inercia, fondo ambiental). Soporta upload de imágenes vía drag-and-drop o botones.
- `421-mint.html` — prototipo funcional de la página de mint con:
  - Carta 3D foil embebida
  - Conexión real a Phantom (con fallback a modo demo si no está instalado)
  - Flujo de mint simulado (4 etapas: verificación → firma → envío → confirmación)
  - Estado de éxito con confetti y links mockeados a Solscan/Magic Eden
- `front.png` — arte del frente de la carta (Miércoles de magos por BrujodelaTele)
- `back.png` — dorso de la carta (oval con 421 e íconos)
- `bg.png` — fondo del entorno 3D (line-art de robots/dinosaurios en halftone)
- Este `CONTEXT.md`

Los HTML auto-detectan `front.png`, `back.png` y `bg.png` en la misma carpeta y los cargan al abrir.

## Próximos pasos para implementación real

### Fase 1: Preparar assets para mint (~1 día)

1. Exportar el frente de la carta en alta resolución (idealmente 2000×2800 px, PNG).
2. Decidir si la metadata es por edición única o numerada (#1/220, #2/220, etc.).
3. Generar 220 archivos JSON de metadata siguiendo el [estándar de Metaplex Core](https://developers.metaplex.com/core/metadata).
4. Opcional: generar un MP4 corto de la carta girando con foil (para el campo `animation_url`) — se puede hacer con screen-recording sobre `421-card-3d.html` con auto-spin activado.
5. Subir todos los assets a Arweave (usar `bundlr` o `irys` CLI).

### Fase 2: Deploy del Candy Machine (~1 día)

1. Instalar Metaplex Sugar CLI: `bash <(curl -sSf https://sugar.metaplex.com/install.sh)`.
2. Configurar `config.json` con:
   - Items: 220
   - Symbol: "421"
   - Royalties: definir % y dirección de recibimiento
   - Guards: `allowList` con root del Merkle tree (vacío inicialmente)
   - Price: 0 SOL
3. Deploy en devnet primero para testing.
4. Hacer mint de prueba con varias wallets.
5. Deploy final en mainnet.

### Fase 3: Backend de subscription gating (~2 días)

1. Crear endpoint `POST /api/nft/authorize-mint` en `server.js`:
   - Recibe wallet address + sesión del usuario (cookie de Ghost)
   - Verifica que el usuario tenga suscripción activa
   - Verifica que no haya claimeado (chequear contra una tabla nueva `nft_claims` con `user_id`, `wallet`, `mint_address`, `claimed_at`)
   - Si todo OK, agrega la wallet al Merkle tree del Candy Machine
   - Retorna el merkle proof que el frontend usará para el mint
2. Endpoint `POST /api/nft/record-claim`:
   - Guarda el claim después de confirmación on-chain
   - Previene doble claim

### Fase 4: Frontend real (~2 días)

1. Reemplazar `421-mint.html` por una versión que use librerías reales:
   - `@solana/web3.js`
   - `@solana/wallet-adapter-react`
   - `@metaplex-foundation/umi`
   - `@metaplex-foundation/mpl-candy-machine`
2. Reemplazar la función `performMint()` simulada por la llamada real al Candy Machine usando el merkle proof del backend.
3. Convertir a una página de Handlebars (`mint.hbs`) integrada al theme de Ghost, con autenticación de usuario activa.
4. Agregar ruta en `routes.yaml`.

### Fase 5: Lanzamiento

1. Beta privada con 5-10 suscriptores cripto-nativos.
2. Comunicación a los 220 suscriptores (newsletter, post en 421).
3. Monitoreo de claims durante la primera semana.
4. Soporte para usuarios sin wallet (instrucciones de Phantom o link a Crossmint).

## Decisiones pendientes

Todas las decisiones del proyecto fueron resueltas — ver sección "Decisiones tomadas" arriba.

A definir más adelante (no bloqueantes):

- **Numeración**: ¿la prioridad anual implica también numeración baja? Ej. anuales reciben los números más bajos. Sugerido.
- **Ventana de claim para anuales**: ¿cuánto dura antes de abrir a mensuales? Sugerido 1 semana exclusiva, después libre para todos.
- **Comunicación a no-claimeantes**: si un suscriptor no claimea en X meses, ¿qué pasa con su cupo? Sugerido: vuelve al pool de reserva tras 6 meses sin actividad.

## Stack técnico sugerido

```
Frontend:
- React + Vite (o vanilla JS si se mantiene compatibilidad con el theme de Ghost)
- @solana/wallet-adapter-react
- @metaplex-foundation/umi
- @metaplex-foundation/mpl-candy-machine

Backend (extender server.js existente):
- Node.js + Express (ya en uso)
- @solana/web3.js para validación on-chain
- @metaplex-foundation/js para gestión de merkle trees
- SQLite o pg para tabla nft_claims (depende de la stack actual)

Tooling:
- Metaplex Sugar CLI
- Irys / Bundlr para Arweave uploads
- Solana CLI para gestión de keypairs y airdrops en devnet

Servicios opcionales:
- Helius o QuickNode para RPC confiable (alternativa al mainnet-beta público)
```

## Costos estimados

- Deploy Candy Machine en mainnet: ~0.5 SOL (~$80 USD)
- Arweave upload de 220 imágenes + metadata: ~$5-15 USD
- RPC dedicado mensual (Helius free tier alcanza para 220 mints, pero $0-49/mes si se escala)
- Mints de los suscriptores: pagados por ellos (~$0.001 cada uno)
- **Total inicial estimado: ~$100 USD**

## Cómo retomar este proyecto desde Claude Code

```bash
cd /Users/juan/Library/CloudStorage/Dropbox/03_claude/421-web
claude
```

Y al inicio decile:

> Leé `nft/CONTEXT.md`. Estamos en el proyecto de NFT collection de 421. Tengo los HTML del visor y la página de mint ya armados como prototipos. Quiero avanzar con [la fase X / el deploy / etc.].
