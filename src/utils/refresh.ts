import { Audio } from 'expo-av';

export async function playRefreshSound() {
  try {
    const { sound } = await Audio.Sound.createAsync(require('../../assets/sounds/sound-refresh.m4a'), {
      shouldPlay: true,
      volume: 0.42,
      rate: 1.04,
      shouldCorrectPitch: true
    });
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync().catch(() => {});
      }
    });
  } catch {}
}

export async function playInboxSound() {
  try {
    const { sound } = await Audio.Sound.createAsync(require('../../assets/sounds/refresh.wav'), {
      shouldPlay: true,
      volume: 0.6,
      rate: 1.0,
      shouldCorrectPitch: true
    });
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync().catch(() => {});
      }
    });
  } catch {}
}
