# Urban 3D Quest — Textes joueurs (source de vérité)

> **Comment utiliser ce fichier**
> Modifie les valeurs ci-dessous, puis dis "applique ui-copy.md".
> Les clés de ce fichier sont lues par `js/ui-copy.js`.
> Les clés (ex: `LOGIN_SOUS_TITRE`) ne doivent pas être renommées — c'est ce qui permet de retrouver chaque texte dans le code.
> `{N}` = variable dynamique (nombre), `{PSEUDO}` = pseudo du joueur — ne pas supprimer.

---

## LOGIN

```
LOGIN_LOGO:         Jadikan · Urban 3D Quest
LOGIN_TITRE:        Urban 3D Quest
LOGIN_SOUS_TITRE:   Des miniatures sont cachées dans la ville.
                    À toi de toutes les retrouver.
LOGIN_PLACEHOLDER:  Ton pseudo
LOGIN_CTA:          Je participe
LOGIN_INVITÉ:       Juste regarder d'abord
```

---

## HEADER & NAVIGATION

```
HEADER_TITRE:       🏙 Urban 3D Quest
HEADER_GPS_INIT:    GPS…
HEADER_AIDE:        Aide
HEADER_AIDE_ARIA:   Ouvrir l'aide
HEADER_BRAND:       Un jeu de Jadikan
NAV_QUETE:          Quête
NAV_FLASH:          Flash
NAV_COMPTE:         Compte
NAV_SCORES:         Scores
```

---

## CARTOUCHE MODE (en-tête de carte)

> Petite barre affichée au-dessus de la minimap selon le mode actif.
> Pour Flash, `{N}` = nombre de miniatures encore disponibles.

```
GUIDE_FLASH_TITRE:
GUIDE_FLASH_SOUS_ZERO:   Aucune miniature disponible pour le moment
GUIDE_FLASH_SOUS_SOLO:   Plus qu'une miniature à trouver
GUIDE_FLASH_SOUS_MULTI:  {N} miniatures à cueillir · sois le premier !
GUIDE_PROGRESS_TEMPLATE: {R} miniatures restantes a cueillir ({F}/{T})
```

---

## AIDE RAPIDE (mini-aide)

```
TUTO_MINI_TITRE:    Chasse Flash
TUTO_MINI_INTRO:    Repere une miniature sur la carte, approche-toi, cueilles la, puis scanne son QR pour valider.
TUTO_MINI_CARD_TITRE: A savoir
TUTO_MINI_CARD_TEXTE: Selon les quetes, tu peux aussi trouver des miniatures Solo et des balises Fixes dans la ville. Plus d infos sur Insta : @jadikan
TUTO_MINI_GPS_BTN:  Activer GPS
TUTO_MINI_CLOSE_BTN: Fermer
TUTO_MINI_NOTE:     Plus d infos sur Instagram : @jadikan
```

---

## BARRE DE PROXIMITÉ — Mode Flash

> `{N}` = nombre de miniatures Flash disponibles.

```
FLASH_COUNT_ONE:          ⚡ 1 miniature dispo
FLASH_COUNT_MULTI:        ⚡ {N} miniatures dispos
FLASH_RADAR_IN_ZONE:      ⚡ Dans la zone — trouve la miniature
```

---

## MODAL DE RÉSULTAT — Flash

```
FIXED_WIN_LABEL:   BALISE TROUVEE
FIXED_WIN_TITRE:   Balise ajoutee a ta collection
FIXED_WIN_DESC:    Bien joue ! Continue la chasse.
FLASH_WIN_LABEL:   CAPTURÉ
FLASH_WIN_TITRE:   Miniature Flash capturée
FLASH_WIN_DESC:    Miniature validée. Partage ta capture et continue la chasse.
FLASH_PRIS_LABEL:  TROP TARD
FLASH_PRIS_TITRE:  Trop tard !
FLASH_PRIS_DESC:   Cette miniature Flash a déjà été capturée.
FLASH_SHARE_KICKER:      FLASH CAPTURÉ · {PSEUDO}
FLASH_SHARE_TITLE:
FLASH_SHARE_TEXT:
FLASH_SHARE_CAPTURE_CTA: Partager
FLASH_SHARE_INVITE_CTA:  Inviter
```

---

## SCANNER QR (mode photo)

```
QR_STATUS_SCAN:   Vise le QR pour le révéler.
QR_STATUS_LIVE:   📷 Vise le QR · appuie sur l'image pour la mise au point
QR_STATUS_FIXED:   Tu as trouvé la balise, prends une photo du QR code pour continuer le jeu.
QR_STATUS_FLASH:   Tu as trouvé la miniature, prends une photo du QR code pour valider ta cueillette.
QR_STATUS_ANALYZING: 🔍 Révélation en cours…
QR_STATUS_BAD_PHOTO: ❌ Polaroid non reconnu — réessaie en te rapprochant et en éclairant bien le polaroid
QR_STATUS_NOT_GAME: ⚠️ Ce code n'appartient pas au jeu — cherche le bon polaroid !
QR_STATUS_WRONG_TREASURE: ⚠️ Mauvais polaroid — cherche le bon !
QR_STATUS_WRONG_TREASURE_DETAIL: ⚠️ Mauvais QR: détecté {SCANNED}. Cherche {EXPECTED}.
QR_STATUS_CAPTURED: ✅ Polaroid révélé !
QR_STATUS_CAMERA_BLOCKED: ⚠️ Caméra bloquée. Autorise la caméra puis utilise la photo de secours.
QR_TARGET_FLASH:   Miniature Flash
QR_TARGET_FLASH_REF: QR-00X
QR_PHOTO_CTA:      📷 Prendre la photo
QR_RETRY_PHOTO_CTA: ↻ Reprendre la photo
QR_TIPS:           Astuce : rapproche-toi du QR code, évite les reflets et assure-toi qu'il occupe bien l'image.

FLASH_TAKEN_TOAST_ONE:   ⚡ {PSEUDO} vient de capturer une miniature !
FLASH_TAKEN_TOAST_MULTI:  ⚡ {N} miniatures viennent d'être capturées !
```

---

## MODAL DE RÉSULTAT — Erreurs

```
FLASH_ALREADY_LABEL:   DÉJÀ FLASHÉ
FLASH_ALREADY_TITRE:   Tu as déjà flashé ce polaroid.
```

---

## ONGLET COMPTE

```
COMPTE_COLLECTION_TITRE:  Mes miniatures
COMPTE_TOTAL_LABEL:       Miniatures
COMPTE_COLLECTION_SOUS:   📷 Polaroids trouvés
COMPTE_LOGIN_EMPTY:       Connecte-toi pour voir tes miniatures
COMPTE_COUNT_TEMPLATE:    {N} revele{S}
COMPTE_VIDE:              Aucune miniature trouvée pour l'instant
COMPTE_PROGRESS_TEMPLATE: {F} miniatures trouvees sur {T} cachees ({R} restantes)
COMPTE_REPORT_CTA:        Signaler une miniature introuvable
```

---

## SIGNALEMENT MINIATURE INTROUVABLE

```
REPORT_MODAL_TITLE:        Signaler une miniature introuvable
REPORT_MODAL_COPY:         Si vous pensez qu'une miniature a disparue du jeu, envoyez un mail avec les infos a Guilhem@jadikan-lp.com
REPORT_MODAL_CLOSE:        Fermer
```

---

## MODAL SCORE

```
SCORE_MODAL_TITLE:        Calcul des points
SCORE_MODAL_COPY:         Classement global : Flash = 50 pts, Solo = 50 pts, Fixe = 35 pts. Plus tu trouves de balises fixes, plus le bonus monte : 2 Fixes = +10 pts, 3 Fixes = +20 pts, 4 Fixes ou plus = +35 pts.
SCORE_MODAL_CLOSE:        Fermer
```

---

## MESSAGES DE RETOUR (toast bienvenue)

```
RETOUR_MESSAGE_FLASH:   Bon retour {PSEUDO} ! Il reste {N} flash a capturer.
```

---

## ERREURS / SYSTÈME

```
ERR_TROP_LOIN:       Tu es à {N}m — trop loin pour révéler. Approche-toi à moins de {R}m.
ERR_TOUS_TROUVES:    Tu as révélé toutes les balises ! 🏆
ERR_INVITÉ:          Mode invité : connecte-toi pour révéler des balises.
ERR_INTROUVABLE:     Polaroid introuvable — il a peut-être été retiré.
ERR_PAS_ACTIF:       Cette balise ou miniature n'est pas encore active.
ERR_RESEAU:          Révélation impossible pour le moment. Réessaie dans quelques secondes.
```
