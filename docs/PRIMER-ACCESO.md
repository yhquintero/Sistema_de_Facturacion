# Primer acceso a Nexo en Windows, paso a paso

Esta guía sirve para quien ya instaló Nexo con el panel y quiere entrar por primera vez desde el mismo PC. También sirve si el navegador muestra «No seguro» o si no recuerdas la contraseña.

Todos los comandos se escriben en **PowerShell 7** (`pwsh`), dentro de la carpeta del proyecto. Por ejemplo:

```powershell
cd C:\ruta\a\Sistema_de_Facturacion
```

> [!IMPORTANT]
> Mientras el menú del panel esté abierto, otra ventana no puede ejecutar acciones del panel (respondería «Otro panel tiene una operación activa»). Usa las opciones del menú, o sal con **[5]** antes de escribir otros comandos.

## Paso 1. Actualizar e iniciar

```powershell
git pull
pwsh -NoProfile -File .\control\Panel-Sistema.ps1 -Action Menu
```

- Si es la **primera vez**, el panel pide el país del servidor, el responsable, el correo de privacidad y una **frase de acceso** de 14 caracteres o más. La frase no se ve al escribirla y se pide dos veces. **Esa frase es la contraseña del usuario `admin`.**
- Si tu instalación es anterior a este cambio y usaba el puerto 8443, ejecuta antes `pwsh -NoProfile -File .\control\Panel-Sistema.ps1 -Action SetPort -HttpsPort 8450`.

Cuando todo está listo, el panel muestra:

```text
Huella SHA-256 del certificado raíz: 4f2a…
WEB + SERVIDOR + TIEMPO REAL: https://localhost:8450
Acceso: usuario «admin» con la frase que escribiste al inicializar…
```

## Paso 2. Confiar en el certificado de Nexo (quita el «No seguro»)

Nexo cifra la conexión con un certificado propio, generado en tu PC por Caddy, el proxy HTTPS («Caddy Local Authority»). Windows no lo conoce hasta que le digas que confíe en él. Hasta entonces, Edge y Chrome muestran **«No seguro»**.

1. En el menú del panel pulsa **[7] Confiar en el certificado**. Fuera del menú, el comando equivalente es:
   ```powershell
   pwsh -NoProfile -File .\control\Panel-Sistema.ps1 -Action TrustLocalCA
   ```
2. El panel muestra el nombre del certificado raíz y dos huellas:
   - **SHA-256**: la que muestra el navegador en el visor de certificados (pestaña *Detalles*, certificado «Caddy Local Authority … Root»).
   - **SHA-1**: la «Huella digital» que mostrará Windows en el paso siguiente.
3. Escribe `CONFIAR` y pulsa Intro.
4. Windows muestra **«Advertencia de seguridad: está a punto de instalar un certificado desde una entidad de certificación…»**. Comprueba que la *Huella digital (sha1)* coincide con la SHA-1 del panel y pulsa **Sí**.
5. El panel confirma: «Listo: este usuario de Windows confía en la CA de Nexo».
6. **Reinicia el navegador por completo**, porque solo lee los certificados de Windows al arrancar:
   - Edge: escribe `edge://restart` en la barra de direcciones y pulsa Intro.
   - Chrome: escribe `chrome://restart` y pulsa Intro.
7. Abre `https://localhost:8450`. Debe aparecer el **candado**, sin «No seguro».

> [!NOTE]
> El certificado de cada visita («Emitido por: Caddy Local Authority – ECC Intermediate») dura unas 12 horas y Caddy lo renueva solo. Es normal que «Nombre común» diga «No forma parte del certificado»: el nombre `localhost` va en otro campo (*Nombre alternativo del firmante*). En lo que se confía es en la **raíz**, que dura años, así que este paso se hace una sola vez por usuario de Windows.

**Firefox** no usa el almacén de Windows. Ve a Ajustes → Privacidad y seguridad → Certificados → *Ver certificados* → *Autoridades* → *Importar*. Elige `%LOCALAPPDATA%\NexoFacturacion\share\Nexo-CA-PUBLICA.crt` y marca «Confiar en esta CA para identificar sitios web».

## Paso 3. Entrar

1. En `https://localhost:8450` escribe:
   - **Usuario:** `admin`
   - **Contraseña:** la frase de acceso del paso 1.
2. Si activaste la verificación en dos pasos, escribe el código de tu aplicación autenticadora.
3. Ya estás dentro. Recomendado a continuación:
   - **Mi cuenta → Verificación en dos pasos**: actívala y guarda los códigos de recuperación en un lugar seguro.
   - **Usuarios y acceso**: crea un usuario personal para cada persona, con su rol (Administrador, Gestor, Técnico o Lectura). No compartas la cuenta `admin`.

## Paso 4 (solo si no recuerdas la contraseña). Contraseña temporal

1. En el menú del panel pulsa **[6] Contraseña temporal de admin**. Fuera del menú, el comando equivalente es:
   ```powershell
   pwsh -NoProfile -File .\control\Panel-Sistema.ps1 -Action ResetPassword
   # Para otro usuario:  -Action ResetPassword -User maria.perez
   ```
2. El panel muestra una línea como esta, **una sola vez**:
   ```text
   Contraseña temporal (cámbiala en el primer acceso): jmrGPP-0QxTfZkLQiQfw
   ```
3. Entra con el usuario `admin` y esa contraseña. Nexo te pide enseguida una **contraseña nueva** de 14 caracteres o más.

Al hacerlo:

- Se cierran las sesiones abiertas de esa cuenta. Datos, facturas, otros usuarios y copias no cambian.
- Con `admin`, la cuenta se reactiva y vuelve a ser administradora si alguien la había desactivado. Si no existe, se crea.
- La contraseña temporal no se guarda en ningún archivo. No la envíes por chat ni por correo.

Si perdiste el teléfono de la verificación en dos pasos y no tienes códigos de recuperación, ejecuta en la consola del servidor `npm run user:reset-password -- admin --reset-2fa`, con `DATA_DIR` apuntando a la base. Lo explica [operación segura](OPERACION-SEGURA.md#cuentas-personales-y-recuperación).

## Si algo no sale

| Lo que ves | Qué significa | Qué hacer |
|---|---|---|
| «No seguro» tras confiar en la CA | El navegador no se reinició del todo | `edge://restart` o `chrome://restart`. En Edge, si persiste, cierra también el icono de Edge junto al reloj |
| «No seguro» en Firefox | Firefox usa su propio almacén | Importa `Nexo-CA-PUBLICA.crt` como se indica en el paso 2 |
| Pantalla de otra aplicación (NovaGest) | Estás en `https://localhost:8443`, que es de NovaGest | Abre `https://localhost:8450` |
| «El puerto HTTPS … ya lo usa otro programa» | Otro programa ocupa el puerto de Nexo | Sigue el comando `-Action SetPort` que propone el mensaje |
| «Otro panel tiene una operación activa» | El menú está abierto en otra ventana | Usa las opciones del menú o sal con [5] |
| «Usuario o contraseña incorrectos» | La frase no coincide | Paso 4 |
| «Demasiados intentos» | Bloqueo temporal tras 5 fallos | Espera 5 minutos o usa el paso 4 |
