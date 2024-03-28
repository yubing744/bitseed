import React from 'react'
import { test, expect } from '@playwright/experimental-ct-react'
import MintStory from './mint.story'

test.use({ viewport: { width: 500, height: 500 } })

test('mint tick', async ({ mount }) => {
  const component = await mount(<MintStory />)

  const moveTickInscriptionId = 'a7609439af50e9165bc0d63aa3808ce078e736238313064210b5c8ab7dbab122i0'

  // Input the InscriptionID
  await component.locator('input[placeholder="TickDeployID"]').fill(moveTickInscriptionId)
  await component.locator('input[placeholder="UserInput"]').fill('20240329')

  // Click the mint button
  await component.locator('button:has-text("Mint")').click()

  // Optionally, check for the presence of the inscriptionId in the output/result
  await expect(component).toContainText('Mint Result: ', {timeout: 60000 })
})
