import type { Meta } from '@storybook/react-vite'

import { createStory } from '../components/createStory'
import { Story } from './3DTilesRenderer-Shadows'

import StoryCode from './3DTilesRenderer-Shadows?raw'

export default {
  title: 'atmosphere/Cityscape',
  tags: ['order:3'],
  parameters: {
    docs: {
      codePanel: true,
      source: {
        language: 'tsx'
      }
    }
  }
} satisfies Meta

export const Cityscape = createStory(Story, {
  props: {
    longitude: -73.9883,
    latitude: 40.7657,
    heading: -42,
    pitch: -25,
    distance: 2667,
    fov: 50,
    csmFar: 1e4
  },
  args: {
    showGround: true,
    toneMappingExposure: 40,
    dayOfYear: 1,
    timeOfDay: 7.6
  },
  parameters: {
    docs: {
      source: {
        code: StoryCode
      }
    }
  }
})
