import { registerRootComponent } from 'expo';

import App from './App';
// Side-effect import: defines the background notification task at module
// load time, BEFORE React mounts. iOS requires the task to be defined
// before the app's first render or it won't be invoked on cold-start
// background pushes.
import { registerBackgroundNotificationTask } from './src/lib/backgroundNotifications';

void registerBackgroundNotificationTask();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
