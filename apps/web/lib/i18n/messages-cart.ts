// New i18n keys generated while translating apps/web/app/cart/page.tsx.
// These keys are NOT yet in lib/i18n/messages.ts — append them there in a
// follow-up review. Until merged, the t() fallback returns the key string.
//
// sv and en MUST have the exact same set of keys.

export const cartPagePending = {
  sv: {
    // Deal helpers (formatDealLabel / dealTypeLabel)
    "cart.dealLabel.freeDelivery": "Fri leverans",
    "cart.dealLabel.fallback": "rabatt",
    "cart.dealType.welcome": "Välkomst",
    "cart.dealType.referralInviter": "Referral-belöning",
    "cart.dealType.referralInvitee": "Referral-rabatt",
    "cart.dealType.fallback": "Rabatt",

    // Heading & empty state
    "cart.heading.prefix": "Din",
    "cart.heading.accent": "Kasse",
    "cart.empty.titlePrefix": "Din kasse är",
    "cart.empty.titleAccent": "tom",

    // Login-prompt banner
    "cart.loginPrompt.cta": "Logga in",
    "cart.loginPrompt.body": "för orderhistorik & rabatter — du kan beställa utan konto.",
    "cart.loginPrompt.account": "Konto",

    // Cart-row helper text
    "cart.tapToEdit": "Tryck för att redigera",

    // Payment section
    "cart.payment.title": "Betala Tryggt",
    "cart.payment.backToDetails": "← Tillbaka till uppgifter",
    "cart.payment.missingTitle": "Betalning ej konfigurerad",
    "cart.payment.missingBody": "Betaltjänsten är inte tillgänglig just nu. Vänligen kontakta restaurangen direkt eller försök igen senare. Ingen kostnad har dragits.",
    "cart.payment.back": "← Tillbaka",

    // Schedule modal extras
    "cart.schedule.quick.45min": "45 min",
    "cart.schedule.quick.1h": "1 timme",
    "cart.schedule.quick.1_5h": "1.5 timmar",
    "cart.schedule.quick.2h": "2 timmar",
    "cart.schedule.quick.3h": "3 timmar",
    "cart.schedule.hour": "Timme",
    "cart.schedule.minute": "Minut",

    // Fields — additional placeholders/labels not in the existing set
    "cart.fields.emailPlaceholderReceipt": "E-post (krävs för kvitto)",
    "cart.fields.addressPlaceholderFull": "Din Gatuadress, Postnummer...",
    "cart.fields.noteLabel": "Extranotering",
    "cart.fields.notePlaceholderExample": "T.ex. portkod 1234, ingen lök i kebaben...",

    // Saved addresses & default badge
    "cart.savedAddresses": "3 sparade adresser",
    "cart.defaultBadge": "Standard",

    // Delivery instruction presets
    "cart.deliveryInstructions.label": "Leveransinstruktioner",
    "cart.deliveryInstructions.ringDoorbell": "Ring på dörren",
    "cart.deliveryInstructions.leaveAtDoor": "Lämna vid dörren",
    "cart.deliveryInstructions.meetOutside": "Möt mig utanför",
    "cart.deliveryInstructions.enterCode": "Portkod behövs",

    // Tip custom-input placeholder
    "cart.tip.customPlaceholder": "Eget belopp i kr",

    // Discount / rewards summary line
    "cart.summary.reward": "Belöning",

    // BOGO banner copy
    "cart.bogo.pickFree": "BOGO — välj gratisprodukt",
    "cart.bogo.pickMoreOne": "BOGO — välj 1 gratis till",
    "cart.bogo.pickMoreMany": "BOGO — välj {count} fler gratis",
    "cart.bogo.progress": "{picked} av {max} valda — välj fler →",
    "cart.bogo.canPickMany": "Du kan välja {max} gratis varor →",
    "cart.bogo.notPickedNamed": "Du har inte valt din gratis {name} →",
    "cart.bogo.notPickedGeneric": "Du har inte valt din gratisprodukt →",
    "cart.bogo.choose": "Välj →",
    "cart.bogo.pickedOne": "Gratisprodukt vald",
    "cart.bogo.swap": "Byt",
    "cart.bogo.pickedMany": "{count} gratis varor valda",
    "cart.bogo.lostSwapped": "Ditt tidigare gratis-val (\"{previous}\") gäller inte längre. Erbjudandet har bytts till \"{current}\".",
    "cart.bogo.lostGone": "Ditt gratis-val (\"{previous}\") är inte längre tillgängligt — erbjudandet har antingen gått ut eller villkoren ändrats.",

    // Deal nudge
    "cart.dealNudge.remaining": "{amount} kr kvar till {reward}",

    // Deals modal
    "cart.dealsModal.titlePrefix": "Dina",
    "cart.dealsModal.titleAccent": "Erbjudanden",
    "cart.dealsModal.ready": "REDO",
    "cart.dealsModal.percentDiscount": "{value}% RABATT",
    "cart.dealsModal.amountDiscount": "{value} KR RABATT",
    "cart.dealsModal.minOrder": "Gäller vid köp över {min} kr",

    // Errors — startCheckout & friends (override / additions to existing cart.errors.*)
    "cart.errors.namePhoneRequired": "Ange namn och telefonnummer.",
    "cart.errors.invalidPromo": "Ogiltig rabattkod.",
    "cart.errors.orderFailed": "Kunde inte slutföra ordern. Kontakta restaurangen.",
    "cart.errors.paymentSucceededOrderMissing": "Betalningen lyckades men ordern kunde inte hittas. Kontakta support.",
    "cart.errors.paymentCancelled": "Betalningen avbröts. Försök igen eller välj en annan betalningsmetod.",
    "cart.errors.paymentFailed": "Betalningen misslyckades. Kontrollera din betalningsinformation och försök igen.",
    "cart.errors.paymentUnavailable": "Betaltjänsten är tillfälligt otillgänglig. Försök igen.",
    "cart.errors.zoneChecking": "Vänligen vänta, vi kontrollerar din leveransadress...",
    "cart.errors.verifyingAddress": "Verifierar adress...",
    "cart.errors.zoneNotCovered": "Den här restaurangen levererar tyvärr inte till din adress. Välj avhämtning eller ange en ny adress.",
    "cart.errors.zoneCheckFailed": "Kunde inte verifiera om vi levererar till din adress. Försök igen om en stund — om problemet kvarstår, välj avhämtning istället.",
    "cart.errors.addressNotFound": "Kunde inte hitta din adress. Försök skriva gatunamn + nummer (t.ex. \"Storgatan 5, Malmö\") och välj förslaget som visas, eller välj avhämtning.",
    "cart.errors.zoneNotCoveredInline": "Restaurangen levererar inte till denna adress.",
    "cart.errors.zoneSummary": "Restaurangen levererar inte till den angivna adressen. Ändra adressen ovan.",
  },
  en: {
    // Deal helpers
    "cart.dealLabel.freeDelivery": "Free delivery",
    "cart.dealLabel.fallback": "discount",
    "cart.dealType.welcome": "Welcome",
    "cart.dealType.referralInviter": "Referral reward",
    "cart.dealType.referralInvitee": "Referral discount",
    "cart.dealType.fallback": "Discount",

    // Heading & empty state
    "cart.heading.prefix": "Your",
    "cart.heading.accent": "Cart",
    "cart.empty.titlePrefix": "Your cart is",
    "cart.empty.titleAccent": "empty",

    // Login-prompt banner
    "cart.loginPrompt.cta": "Sign in",
    "cart.loginPrompt.body": "for order history & rewards — you can still order as a guest.",
    "cart.loginPrompt.account": "Sign up",

    // Cart-row helper text
    "cart.tapToEdit": "Tap to edit",

    // Payment section
    "cart.payment.title": "Pay securely",
    "cart.payment.backToDetails": "← Back to details",
    "cart.payment.missingTitle": "Payments not configured",
    "cart.payment.missingBody": "The payment service is unavailable right now. Please contact the restaurant directly or try again later. You have not been charged.",
    "cart.payment.back": "← Back",

    // Schedule modal extras
    "cart.schedule.quick.45min": "45 min",
    "cart.schedule.quick.1h": "1 hour",
    "cart.schedule.quick.1_5h": "1.5 hours",
    "cart.schedule.quick.2h": "2 hours",
    "cart.schedule.quick.3h": "3 hours",
    "cart.schedule.hour": "Hour",
    "cart.schedule.minute": "Minute",

    // Fields — additional placeholders/labels
    "cart.fields.emailPlaceholderReceipt": "Email (required for receipt)",
    "cart.fields.addressPlaceholderFull": "Street address, postcode...",
    "cart.fields.noteLabel": "Additional note",
    "cart.fields.notePlaceholderExample": "E.g. gate code 1234, no onions in the kebab...",

    // Saved addresses & default badge
    "cart.savedAddresses": "3 saved addresses",
    "cart.defaultBadge": "Default",

    // Delivery instruction presets
    "cart.deliveryInstructions.label": "Delivery instructions",
    "cart.deliveryInstructions.ringDoorbell": "Ring the doorbell",
    "cart.deliveryInstructions.leaveAtDoor": "Leave at the door",
    "cart.deliveryInstructions.meetOutside": "Meet me outside",
    "cart.deliveryInstructions.enterCode": "Gate code needed",

    // Tip custom-input placeholder
    "cart.tip.customPlaceholder": "Custom amount in kr",

    // Discount / rewards summary line
    "cart.summary.reward": "Reward",

    // BOGO banner copy
    "cart.bogo.pickFree": "BOGO — pick your free item",
    "cart.bogo.pickMoreOne": "BOGO — pick 1 more free",
    "cart.bogo.pickMoreMany": "BOGO — pick {count} more free",
    "cart.bogo.progress": "{picked} of {max} picked — pick more →",
    "cart.bogo.canPickMany": "You can pick {max} free items →",
    "cart.bogo.notPickedNamed": "You haven't picked your free {name} →",
    "cart.bogo.notPickedGeneric": "You haven't picked your free item →",
    "cart.bogo.choose": "Pick →",
    "cart.bogo.pickedOne": "Free item picked",
    "cart.bogo.swap": "Change",
    "cart.bogo.pickedMany": "{count} free items picked",
    "cart.bogo.lostSwapped": "Your previous free pick (\"{previous}\") is no longer valid. The offer has switched to \"{current}\".",
    "cart.bogo.lostGone": "Your free pick (\"{previous}\") is no longer available — the offer expired or its conditions changed.",

    // Deal nudge
    "cart.dealNudge.remaining": "{amount} kr away from {reward}",

    // Deals modal
    "cart.dealsModal.titlePrefix": "Your",
    "cart.dealsModal.titleAccent": "Offers",
    "cart.dealsModal.ready": "READY",
    "cart.dealsModal.percentDiscount": "{value}% OFF",
    "cart.dealsModal.amountDiscount": "{value} KR OFF",
    "cart.dealsModal.minOrder": "Valid on orders over {min} kr",

    // Errors
    "cart.errors.namePhoneRequired": "Please enter your name and phone number.",
    "cart.errors.invalidPromo": "Invalid discount code.",
    "cart.errors.orderFailed": "Couldn't complete the order. Please contact the restaurant.",
    "cart.errors.paymentSucceededOrderMissing": "Payment went through but the order couldn't be found. Please contact support.",
    "cart.errors.paymentCancelled": "Payment was cancelled. Try again or pick a different payment method.",
    "cart.errors.paymentFailed": "Payment failed. Check your payment details and try again.",
    "cart.errors.paymentUnavailable": "The payment service is temporarily unavailable. Please try again.",
    "cart.errors.zoneChecking": "Please wait, we're checking your delivery address...",
    "cart.errors.verifyingAddress": "Verifying address...",
    "cart.errors.zoneNotCovered": "This restaurant doesn't deliver to your address. Choose pickup or enter a different address.",
    "cart.errors.zoneCheckFailed": "Couldn't verify whether we deliver to your address. Try again shortly — if the problem persists, choose pickup instead.",
    "cart.errors.addressNotFound": "We couldn't find your address. Try entering the street name + number (e.g. \"Storgatan 5, Malmö\") and pick the suggestion that appears, or choose pickup.",
    "cart.errors.zoneNotCoveredInline": "The restaurant doesn't deliver to this address.",
    "cart.errors.zoneSummary": "The restaurant doesn't deliver to the given address. Change the address above.",
  },
};
