/**
 * Atualização automática (só dentro do app de Mac). No navegador não faz nada.
 * As versões novas são publicadas como "release" no GitHub pelo fluxo
 * .github/workflows/release.yml, assinadas com a chave do projeto.
 */
export const noApp = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export interface Novidade {
  versao: string
  notas?: string
  instalar: (progresso: (pct: number) => void) => Promise<void>
}

export async function procurarAtualizacao(): Promise<Novidade | null> {
  if (!noApp) return null
  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    const upd = await check()
    if (!upd) return null
    return {
      versao: upd.version,
      notas: upd.body,
      instalar: async (progresso) => {
        let total = 0, baixado = 0
        await upd.downloadAndInstall((ev) => {
          if (ev.event === 'Started') total = ev.data.contentLength ?? 0
          if (ev.event === 'Progress') {
            baixado += ev.data.chunkLength
            if (total) progresso(Math.round((baixado / total) * 100))
          }
        })
        const { relaunch } = await import('@tauri-apps/plugin-process')
        await relaunch()
      },
    }
  } catch (e) {
    console.warn('Não foi possível procurar atualização:', e)
    return null
  }
}
