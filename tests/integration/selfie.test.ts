import { describe, expect, it } from 'vitest'
import { C, E, type PlayerView } from '@/shared/protocol'
import { setupHarness, watch } from './harness'

/**
 * Selfieflyten ende-til-ende: opplasting, tilgangskontroll og sletting.
 * Bildet skal aldri overleve rommet det ble tatt i (§25).
 */
const h = setupHarness()

function jpeg(størrelse = 128): Buffer {
  const buffer = Buffer.alloc(størrelse)
  buffer.set([0xff, 0xd8, 0xff, 0xe0], 0)
  return buffer
}

describe('opplasting', () => {
  it('lagrer bildet og viser det i alle visninger', async () => {
    const lobby = await h.createLobby()
    const ada = await h.joinAs(lobby, 'Ada')

    const svar = await h.expectOk<{ selfieUrl: string }>(
      ada.socket,
      C.playerUploadSelfie,
      { ...ada.auth, contentType: 'image/jpeg', data: jpeg() },
    )
    expect(svar.selfieUrl).toMatch(/^\/api\/selfie\/room_[\w-]+\/[\w-]+$/)

    const vert = await lobby.state.until((v) =>
      Boolean(v.roster.find((s) => s.name === 'Ada')?.hasSelfie),
    )
    const plass = vert.roster.find((s) => s.name === 'Ada')
    expect(plass?.selfieUrl).toBe(svar.selfieUrl)
    expect(h.game.selfieStore.size).toBe(1)
  })

  it('markerer profilen som ferdig, så en reconnect ikke spør igjen', async () => {
    const lobby = await h.createLobby()
    const ada = await h.joinAs(lobby, 'Ada')
    const state = watch<PlayerView>(ada.socket, E.playerState)

    // Leses fra lageret: øyeblikksbildet fra selve innmeldingen rakk å bli sendt
    // før overvåkeren festet seg, og det er ikke noe å vente på her.
    const rom = h.game.store.get(lobby.roomId)!
    expect(rom.players[0].profileReady).toBe(false)

    await h.expectOk(ada.socket, C.playerUploadSelfie, {
      ...ada.auth,
      contentType: 'image/jpeg',
      data: jpeg(),
    })
    expect((await state.until((v) => Boolean(v.me?.profileReady))).me?.hasSelfie).toBe(true)
  })

  it('lar spilleren velge dyret sitt i stedet', async () => {
    const lobby = await h.createLobby()
    const ada = await h.joinAs(lobby, 'Ada')
    const state = watch<PlayerView>(ada.socket, E.playerState)

    await h.expectOk(ada.socket, C.playerUseAvatar, ada.auth)

    const view = await state.until((v) => Boolean(v.me?.profileReady))
    expect(view.me?.hasSelfie).toBe(false)
    expect(view.me?.selfieUrl).toBeNull()
  })

  it('rydder bort det forrige bildet når spilleren tar et nytt', async () => {
    const lobby = await h.createLobby()
    const ada = await h.joinAs(lobby, 'Ada')

    const første = await h.expectOk<{ selfieUrl: string }>(
      ada.socket,
      C.playerUploadSelfie,
      { ...ada.auth, contentType: 'image/jpeg', data: jpeg() },
    )
    const andre = await h.expectOk<{ selfieUrl: string }>(
      ada.socket,
      C.playerUploadSelfie,
      { ...ada.auth, contentType: 'image/jpeg', data: jpeg(200) },
    )

    expect(andre.selfieUrl).not.toBe(første.selfieUrl)
    // Fem selfier på rad skal ikke etterlate fire bilder i minnet.
    expect(h.game.selfieStore.size).toBe(1)
  })

  it('sletter bildet når spilleren bytter til avatar', async () => {
    const lobby = await h.createLobby()
    const ada = await h.joinAs(lobby, 'Ada')
    await h.expectOk(ada.socket, C.playerUploadSelfie, {
      ...ada.auth,
      contentType: 'image/jpeg',
      data: jpeg(),
    })
    expect(h.game.selfieStore.size).toBe(1)

    await h.expectOk(ada.socket, C.playerUseAvatar, ada.auth)
    expect(h.game.selfieStore.size).toBe(0)
  })
})

describe('avvisning', () => {
  it('avviser noe som ikke er et bilde', async () => {
    const lobby = await h.createLobby()
    const ada = await h.joinAs(lobby, 'Ada')

    const svar = await h.ask(ada.socket, C.playerUploadSelfie, {
      ...ada.auth,
      contentType: 'image/jpeg',
      data: Buffer.from('dette er ikke et bilde i det hele tatt'),
    })
    expect(svar.ok).toBe(false)
    if (!svar.ok) expect(svar.code).toBe('selfie/notAnImage')
    expect(h.game.selfieStore.size).toBe(0)
  })

  it('avviser et bilde som er for stort', async () => {
    const lobby = await h.createLobby()
    const ada = await h.joinAs(lobby, 'Ada')

    const svar = await h.ask(ada.socket, C.playerUploadSelfie, {
      ...ada.auth,
      contentType: 'image/jpeg',
      data: jpeg(400 * 1024),
    })
    expect(svar.ok).toBe(false)
    if (!svar.ok) expect(svar.code).toBe('selfie/tooBig')
  })

  it('avviser en filtype vi ikke støtter', async () => {
    const lobby = await h.createLobby()
    const ada = await h.joinAs(lobby, 'Ada')

    const svar = await h.ask(ada.socket, C.playerUploadSelfie, {
      ...ada.auth,
      contentType: 'image/gif',
      data: jpeg(),
    })
    expect(svar.ok).toBe(false)
    if (!svar.ok) expect(svar.code).toBe('input/invalid')
  })

  it('avviser en opplasting uten gyldig gjenopprettingsnøkkel', async () => {
    const lobby = await h.createLobby()
    const ada = await h.joinAs(lobby, 'Ada')

    const svar = await h.ask(ada.socket, C.playerUploadSelfie, {
      ...ada.auth,
      recoveryKey: 'x'.repeat(43),
      contentType: 'image/jpeg',
      data: jpeg(),
    })
    expect(svar.ok).toBe(false)
    if (!svar.ok) expect(svar.code).toBe('auth/player')
    expect(h.game.selfieStore.size).toBe(0)
  })
})

describe('sletting', () => {
  it('sletter alle bildene når verten avslutter rommet', async () => {
    const lobby = await h.createLobby()
    const ada = await h.joinAs(lobby, 'Ada')
    const edvin = await h.joinAs(lobby, 'Bo')

    for (const spiller of [ada, edvin]) {
      await h.expectOk(spiller.socket, C.playerUploadSelfie, {
        ...spiller.auth,
        contentType: 'image/jpeg',
        data: jpeg(),
      })
    }
    expect(h.game.selfieStore.size).toBe(2)

    await h.expectOk(lobby.host, C.hostCloseRoom, lobby.next())
    expect(h.game.selfieStore.size).toBe(0)
  })

  it('sletter bildene når rommet går ut på tid', async () => {
    const lobby = await h.createLobby()
    const ada = await h.joinAs(lobby, 'Ada')
    await h.expectOk(ada.socket, C.playerUploadSelfie, {
      ...ada.auth,
      contentType: 'image/jpeg',
      data: jpeg(),
    })

    const rom = h.game.store.get(lobby.roomId)!
    rom.lastActivityAt = Date.now() - 60 * 60 * 1000

    expect(h.game.sweep()).toBe(1)
    expect(h.game.selfieStore.size).toBe(0)
  })
})
