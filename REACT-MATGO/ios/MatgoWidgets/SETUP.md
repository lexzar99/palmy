# MatgoWidgets — Widget Extension Setup

These Swift files implement the Dynamic Island Live Activity for order tracking.
They must be added to a **Widget Extension** Xcode target.

## One-time Xcode setup (5 minutes)

1. Open `ios/REACTMATGO.xcworkspace` in Xcode

2. **File → New → Target**
   - Choose **Widget Extension**
   - Product Name: `MatgoWidgets`
   - Bundle Identifier: `com.matgo.reactnative.widgets`
   - Language: Swift
   - Uncheck "Include Configuration Intent"
   - Finish

3. **Add the Swift files** to the MatgoWidgets target:
   - Right-click `MatgoWidgets` group in Project Navigator
   - "Add Files to MatgoWidgets..."
   - Add all `.swift` files from this directory (except this README)
   - Make sure target membership = **MatgoWidgets only**

4. **Delete** the auto-generated `MatgoWidgets.swift` file that Xcode created
   (we replace it with our own `MatgoWidgetsBundle.swift`)

5. In **REACTMATGO** (main app) target settings:
   - Build Phases → Link Binary with Libraries → Add **ActivityKit.framework**
   - This is needed for the `LiveActivitiesModule.swift` in the main app

6. Also add `LiveActivitiesModule.swift` to the **REACTMATGO** main target:
   - It's in `ios/REACTMATGO/LiveActivitiesModule.swift`
   - Should already be in the target if you open the xcworkspace

7. Run: `npx expo run:ios --device "YOUR_DEVICE_UDID" --no-install`

## How it works

- When an order is placed → `startOrderActivity()` in JS → `LiveActivitiesModule.swift`
  starts an `OrderDeliveryAttributes` Live Activity
- The Widget Extension (`MatgoWidgets`) renders the Dynamic Island UI using the same
  `OrderDeliveryAttributes` struct (duplicated in both targets — required by ActivityKit)
- Updates flow: JS `updateOrderActivity()` → ActivityKit → Dynamic Island refreshes
- On delivery: `endOrderActivity()` → activity fades from Dynamic Island after ~8s
