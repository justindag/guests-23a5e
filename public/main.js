'use strict';

function GuestManager() {
  this.checkSetup();

  this.tokenInput = document.getElementById('token');

  this.signInButton = document.getElementById('sign-in');
  this.signOutButton = document.getElementById('sign-out');
  this.signInSnackbar = document.getElementById('must-signin-snackbar');
  this.userName = document.getElementById('user-name');

  this.addGuestForm = document.getElementById('add-guest-form');
  this.nameInput = document.getElementById('name');
  this.emailInput = document.getElementById('email');
  this.phoneInput = document.getElementById('phone');

  this.guestList = document.getElementById('guest-list');

  this.signOutButton.addEventListener('click', this.signOut.bind(this));
  this.signInButton.addEventListener('click', this.signIn.bind(this));
  this.addGuestForm.addEventListener('submit', this.addGuest.bind(this));

  this.initFirebase();

  // Load currently existing guest list.
  let eventId = document.head.querySelector("[name=eventId]").content;
  this.loadGuestList(eventId);
}

// Template for rendering guests.
GuestManager.GUEST_TEMPLATE =
  '<div class="guest-container">' +
  '<span class="name"></span>&nbsp;&nbsp;&nbsp;&nbsp;' +
  '<span class="status"></span>&nbsp;&nbsp;&nbsp;&nbsp;' +
  '<a class="remove" href="#">Remove</a>' +
  '</div>';

// Sets up shortcuts to Firebase features and initiate firebase auth.
GuestManager.prototype.initFirebase = function () {
  try {
    let app = firebase.app();
    let features = ['auth', 'database', 'messaging', 'storage'].filter(feature => typeof app[feature] === 'function');
    document.getElementById('load').innerHTML = `Firebase SDK loaded with ${features.join(', ')}`;
  } catch (e) {
    console.error(e);
    document.getElementById('load').innerHTML = 'Error loading the Firebase SDK, check the console.';
  }

  this.auth = firebase.auth();
  this.database = firebase.database();

  // Initiates Firebase auth and listen to auth state changes.
  this.auth.onAuthStateChanged(this.onAuthStateChanged.bind(this));
};

// Triggers when the auth state change for instance when the user signs-in or signs-out.
GuestManager.prototype.onAuthStateChanged = function (user) {
  if (user) { // signed in
    console.log("user is signed in: ");
    console.log(user);

    var userName = user.displayName || user.uid;
    this.userName.textContent = userName;

    // Show user's profile and sign-out button.
    this.userName.removeAttribute('hidden');
    this.signOutButton.removeAttribute('hidden');

    // Hide sign-in button.
    this.signInButton.setAttribute('hidden', 'true');

    let eventId = document.head.querySelector("[name=eventId]").content;
    // Load existing guests
    this.loadGuestList(eventId, user.uid);

    // Save the Firebase Messaging Device token and enable notifications.
    this.saveMessagingDeviceToken();
  } else { // User is signed out!
    console.log("user is signed out.");

    // Hide user's profile and sign-out button.
    this.userName.setAttribute('hidden', 'true');
    this.signOutButton.setAttribute('hidden', 'true');

    // Show sign-in button.
    this.signInButton.removeAttribute('hidden');
  }
};

// Loads event guest history and listens for upcoming ones.
GuestManager.prototype.loadGuestList = function (eventID, hostID) {
  // let path = this.getEventGuestPath(eventID, hostID, "");
  let path = this.getEventGuestPath(eventID, null, "");
  console.log('load guest list path for user '+hostID+' : '+path);
  this.guestListRef = this.database.ref(path);
  // Make sure we remove all previous listeners.
  this.guestListRef.off();

  // Loads the last 12 messages and listen for new ones.
  var setGuestList = function (data) {
    // console.log('setGuestList called with:');
    // console.log(data);
    var val = data.val();
    this.displayGuest(data.key, eventID, val.name, val.status, val.email, val.additionalGuests);
  }.bind(this);

  //TODO: These fire off even on permission denied, and will still render to the UI
  this.guestListRef.limitToLast(12).on('child_added', setGuestList);
  this.guestListRef.limitToLast(12).on('child_changed', setGuestList);
};

GuestManager.prototype.addGuest = function (e) {
  e.preventDefault();

  // Check that the user is signed in.
  if (this.checkSignedInWithMessage()) {
        let currentUser = this.auth.currentUser;
        console.log("Current User: ");
        console.log(currentUser);

        // let now = Date.now();
        let now = firebase.database.ServerValue.TIMESTAMP;

        let eventId = document.head.querySelector("[name=eventId]").content,//"5327041a-5196-47cf-a0e5-d63aeaa6a2ea",
          hostId = currentUser.uid,//"123456789",

          name = this.nameInput.value;
        if (!name) {
          window.alert('name is required');
          return
        }

        let email = this.emailInput.value;
        let phone = this.phoneInput.value;

    let addlGuests = 0,
          status = 'attending';

    let guest = {
          eventId: eventId,
          status: status,
          name: name,
          email: email,
          phone: phone,
          additionalGuests: addlGuests,
          created_at: now
        };

    let pubGuest = {
          eventId: eventId,
          status: status,
          name: name,
          additionalGuests: addlGuests,
          created_at: now
        };

        // Get a key for a new Guest.
    let newGuestKey = firebase.database().ref(this.getEventGuestPath(eventId, hostId)).push().key;

        // Atomically write the new guest's data simultaneously to public and private
    let updates = {};
        updates[this.getEventGuestPath(eventId, hostId, newGuestKey)] = guest;
        updates[this.getEventGuestPath(eventId, null, newGuestKey)] = pubGuest;

        firebase.database().ref().update(updates).then(() => {
          console.log('Write succeeded!');
          this.nameInput.value = "";
          this.emailInput.value = "";
          this.phoneInput.value = "";
          this.nameInput.focus();
        }).catch((e) => {
            console.log('Write failed: ');
            console.log(e);
        });
    }
    this.signIn();
};

// Displays a Guest in the UI.
GuestManager.prototype.displayGuest = function (key, eventId, name, status, email, additionalGuests) {
  var li = document.getElementById(key);
  // If an element for that message does not exists yet we create it.
  if (!li) {
    var container = document.createElement('li');
    container.innerHTML = GuestManager.GUEST_TEMPLATE;
    li = container.firstChild;
    li.setAttribute('id', key);
    this.guestList.appendChild(li);
  }

  li.querySelector('.name').textContent = name;
  // if (email) {
  //   li.querySelector('.email').textContent = email;
  // }

  li.querySelector('.status').textContent = status;

  let removeLink = li.querySelector('.remove');
  removeLink.setAttribute('id', key);
  removeLink.addEventListener('click', function (e) {
    let currentUser = this.auth.currentUser;
    let privatePath = this.getEventGuestPath(eventId, currentUser.uid, key);
    let pubPath = this.getEventGuestPath(eventId, null, key);

    // Atomically delete guest's data from public and private
    var updates = {};
    updates[privatePath] = null;
    updates[pubPath] = null;

    firebase.database().ref().update(updates).then(() => {
      var li = document.getElementById(key);
      this.guestList.removeChild(li);
    }).catch((e) => {
        console.log('Delete failed: ');
        console.log(e);
    });
  }.bind(this));


  // Show the card fading-in.
  setTimeout(function () {
    li.classList.add('visible')
  }, 1);
  this.guestList.scrollTop = this.guestList.scrollHeight;
};

// Signs-in
GuestManager.prototype.signIn = function () {
  // Sign in Firebase using popup auth and Google as the identity provider.
  // var provider = new firebase.auth.GoogleAuthProvider();
  // this.auth.signInWithPopup(provider);

  let token = this.tokenInput.value;

  firebase.auth().signInWithCustomToken(token).catch(function(error) {
    var errorCode = error.code;
    var errorMessage = error.message;
    console.log('sign in failed: ');
    console.log(error);
  });
};

// Signs-out
GuestManager.prototype.signOut = function () {
  // Sign out of Firebase.
  this.auth.signOut();
  this.guestList.innerHTML = "";
};

// Returns true if user is signed-in. Otherwise false and displays a message.
GuestManager.prototype.checkSignedInWithMessage = function () {
  // Return true if the user is signed in Firebase
  if (this.auth.currentUser) {
    return true;
  }

  // Display a message to the user using a Toast.
  var data = {
    message: 'You must sign-in first',
    timeout: 2000
  };

  this.signInSnackbar.MaterialSnackbar.showSnackbar(data);

  console.log(data.message);

  return false;
};

// Saves the messaging device token to the datastore.
GuestManager.prototype.saveMessagingDeviceToken = function () {
  console.log('Firebase Notifications not enabled');
  // firebase.messaging().getToken().then(function (currentToken) {
  //   if (currentToken) {
  //     console.log('Got FCM device token:', currentToken);
  //     // Saving the Device Token to the datastore.
  //     firebase.database().ref('/fcmTokens').child(currentToken)
  //       .set(firebase.auth().currentUser.uid);
  //   } else {
  //     // Need to request permissions to show notifications.
  //     this.requestNotificationsPermissions();
  //   }
  // }.bind(this)).catch(function (error) {
  //   console.error('Unable to get messaging token.', error);
  // });
};

// Requests permissions to show notifications.
GuestManager.prototype.requestNotificationsPermissions = function () {
  console.log('Requesting notifications permission...');
  firebase.messaging().requestPermission().then(function () {
    // Notification permission granted.
    this.saveMessagingDeviceToken();
  }.bind(this)).catch(function (error) {
    console.error('Unable to get permission to notify.', error);
  });
};

// Resets the given MaterialTextField.
GuestManager.resetMaterialTextfield = function (element) {
  element.value = '';
  element.parentNode.MaterialTextfield.boundUpdateClassesHandler();
};

GuestManager.prototype.getEventGuestPath = function (eventId, hostId, guestId) {
  if (hostId) {
    return `/eventGuestsPrivate/${hostId}/${eventId}/${guestId}`;
  }
  return `/eventGuestsPublic/${eventId}/${guestId}`;
};

// Checks that the Firebase SDK has been correctly setup and configured.
GuestManager.prototype.checkSetup = function () {
  if (!window.firebase || !(firebase.app instanceof Function) || !firebase.app().options) {
    window.alert('Firebase SDK not configured and imported');
  }
};

GuestManager.prototype.checkConnStatus = function () {
  console.log('checkConnStatus called.');
  var connectedRef = firebase.database().ref(".info/connected");
  connectedRef.on("value", function (snap) {
    let status = 'not connected';
    if (snap.val() === true) {
      status = 'connected';
      console.log("connected");
    } else {
      console.log("not connected");
    }

    let connStatus = document.getElementById('conn-status');
    connStatus.textContent = status;
  });
};

window.onload = function () {
  window.guestManager = new GuestManager();
  window.guestManager.checkConnStatus();
};
