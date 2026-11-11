/**
 * Obtención de la clave con la que se firman los JWT de JaaS.
 *
 * Solo se importa desde el servidor (usa `node:fs`): nunca desde un Client
 * Component ni desde código que acabe en el bundle del navegador.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Fichero con la clave privada en la raíz del proyecto. Se lee con
 * `fs.readFileSync` para no tener que pegar el PEM en una variable de entorno
 * (los saltos de línea se rompen con facilidad al copiar y pegar).
 */
export const PRIVATE_KEY_FILE = "private.key";

/**
 * Devuelve el contenido de `private.key` o `null` si no existe.
 *
 * Se lee en cada petición de token (fichero de ~2 KB): así un cambio de clave
 * se aplica sin reiniciar el servidor y no hay estado global que invalidar.
 */
export function readPrivateKeyFile(): string | null {
  const keyPath = path.join(process.cwd(), PRIVATE_KEY_FILE);

  try {
    // Normalizamos CRLF → LF: la clave se descarga desde el navegador y puede
    // venir con saltos de línea de Windows, que algunas herramientas de firma
    // rechazan.
    const key = readFileSync(keyPath, "utf8")
      .replace(/\r\n?/g, "\n")
      .trim();
    return key.length > 0 ? key : null;
  } catch {
    return null;
  }
}

/**
 * Clave de firma, por orden de prioridad:
 *
 * 1. `JITSI_APP_SECRET` (recomendado en despliegues: el fichero no viaja con
 *    el build y se puede rotar sin tocar el código).
 * 2. `./private.key` en la raíz del proyecto (cómodo en local).
 *
 * Acepta tanto la clave HMAC del tenant (HS256) como una clave privada PEM
 * (RS256); `createJitsiToken` elige el algoritmo mirando el contenido.
 */
export function getJitsiSigningKey(): string | null {
  const fromEnv = process.env.JITSI_APP_SECRET?.trim();
  return fromEnv || readPrivateKeyFile();
}
