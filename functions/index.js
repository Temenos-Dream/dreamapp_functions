const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

//test commands
//firebase functions:shell
//test()
exports.test = functions.https.onRequest(async (request, response) => {
  console.log("testing sort friends lists");
});

function date_sortFunction(a, b) {
  var dateA = new Date(a.created).getTime();
  var dateB = new Date(b.created).getTime();
  return dateA > dateB ? -1 : 1;
}

async function sortFriendsLists() {
  await admin
    .firestore()
    .collection("Users")
    .get()
    .then((snapshot) => {
      users = snapshot.docs;
      users.forEach(async (user) => {
        user = user.data();
        if (user.friends.length > 10) {
          let sortedFriendsList = [];
          let newFriendList = [];
          console.log(user.profileCore.username + " " + user.id);
          for (let i = 0; i < user.friends.length; i++) {
            let friendId = user.friends[i];
            let dreamSnapshot = await admin
              .firestore()
              .collection("PublicDreams")
              .where("uid", "==", friendId)
              .orderBy("created", "desc")
              .limit(2)
              .get();
            dreams = dreamSnapshot.docs;
            let latestDreamTime = "2020-01-01T00:00:00.000Z"; // old dream
            if (dreams.length > 0) {
              latestDreamTime = dreams[0].data().created;
              console.log("found dream of " + friendId);
            }
            sortedFriendsList.push({
              id: friendId,
              created: latestDreamTime,
            });
          }
          sortedFriendsList = sortedFriendsList.sort(date_sortFunction);
          newFriendList = sortedFriendsList.map((item) => item.id);
          console.log(JSON.stringify(newFriendList, null, 2));
          await admin
            .firestore()
            .collection("Users")
            .doc(user.id)
            .update({ friends: newFriendList });
        }
      });
    });
}

const autoId = () => {
  const CHARS =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let autoId = "";
  for (let i = 0; i < 20; i++) {
    autoId += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }
  return autoId;
};

const smartTruncate = (value, length, endString = "...") => {
  if (value) {
    if (value.length > length) {
      value = value.substring(0, length - 1).trim() + endString;
    }
  } else {
    value = "";
  }
  return value.trim();
};

exports.publicDreamCreate = functions.firestore
  .document("PublicDreams/{docId}")
  .onCreate(async (snap, context) => {
    const doc = snap.data();
    if (doc.privacy == "shared") {
      shareDreamCreateActivities(doc);
    } else {
      // createDream_NewActivity_ForFriends(doc);
    }
    sortFriendsLists();
  });

async function createDream_NewActivity_ForFriends(doc) {
  let userWhoPostedDream = await admin
    .firestore()
    .collection("Users")
    .doc(doc.uid)
    .get();
  if (userWhoPostedDream && userWhoPostedDream.friends) {
  }
}

exports.publicDreamUpdate = functions.firestore
  .document("PublicDreams/{docId}")
  .onUpdate(async (change, context) => {
    // ...the new value after this update
    const after = change.after.data() || {};
    // ...the previous value before this update
    const prev = change.before.data() || {};

    if (prev.privacy != "shared" && after.privacy == "shared") {
      shareDreamCreateActivities(after);
    }

    await admin
      .firestore()
      .collection("Users")
      .get()
      .then((snapshot) => {
        // console.log(snapshot.docs.length);
        users = snapshot.docs;
        users.forEach(() => {});
      });
  });

function shareDreamCreateActivities(doc) {
  doc.sharedWith.forEach(async (shareWithId) => {
    let activity = {
      id: autoId(),
      type: "share",
      message:
        doc.username + " shared their dream with you 📩 click here to view it",
      created: new Date(),
      for_id: shareWithId,
      from_id: doc.uid,
      from_name: doc.username,
      from_pic: "/profilePics/" + doc.uid + ".png",
      dreamId: doc.id,
    };
    let query = await admin
      .firestore()
      .collection("Activity")
      .doc(activity.id)
      .set(activity);
  });
}

exports.commentCreate = functions.firestore
  .document("Comments/{docId}")
  .onCreate(async (snap, context) => {
    let doc = snap.data();
    await admin
      .firestore()
      .collection("Comments")
      .where("dreamId", "==", doc.dreamId)
      .get()
      .then(async (snapshot) => {
        await admin
          .firestore()
          .collection("PublicDreams")
          .doc(doc.dreamId)
          .update({ commentCount: snapshot.docs.length });
      });
  });

exports.commentDelete = functions.firestore
  .document("Comments/{docId}")
  .onDelete(async (snap, context) => {
    let doc = snap.data();
    await admin
      .firestore()
      .collection("Comments")
      .where("dreamId", "==", doc.dreamId)
      .get()
      .then(async (snapshot) => {
        await admin
          .firestore()
          .collection("PublicDreams")
          .doc(doc.dreamId)
          .update({ commentCount: snapshot.docs.length });
      });
  });

exports.dreamInfoCreate = functions.firestore //dreaminfo stores data about the dream we don't want to pull from the cloud all the time. because it would be too much data and slow down the app.
  .document("DreamInfo/{docId}")
  .onCreate(async (snap, context) => {
    let doc = snap.data();
    let query = await admin
      .firestore()
      .collection("PublicDreams")
      .doc(doc.id)
      .update({ viewCount: 1 });
  });

exports.dreamInfoUpdate = functions.firestore //dreaminfo stores data about the dream we don't want to pull from the cloud all the time. because it would be too much data and slow down the app.
  .document("DreamInfo/{docId}")
  .onUpdate(async (change, context) => {
    // ...the new value after this update
    const doc = change.after.data() || {};
    // ...the previous value before this update
    const prev = change.before.data() || {};

    if (doc.viewers.length > prev.viewers.length) {
      let query = await admin
        .firestore()
        .collection("PublicDreams")
        .doc(doc.id)
        .update({ viewCount: doc.viewers.length });
    }
  });

exports.commentAction = functions.firestore
  .document("Comments/{docId}")
  .onUpdate(async (change, context) => {
    // ...the new value after this update
    const doc = change.after.data() || {};
    // ...the previous value before this update
    const previousValue = change.before.data() || {};
    if (doc.score > previousValue.score) {
      let activity = {
        id: autoId(),
        type: "upvote",
        message: "",
        created: new Date(),
        for_id: doc.authorId,
        from_id: "",
        from_name: "Upvote",
        from_pic: "/other/upvote_one.png",
        dreamId: doc.dreamId,
        comment: doc,
      };
      if (doc.score == 2) {
        activity.message = "1st upvote! ⬆️";
      } else if (doc.score == 11) {
        activity.message = "10th upvote! ⬆️";
      } else if (doc.score == 26) {
        activity.message = "25th upvote! ⬆️";
      } else if (doc.score == 101) {
        activity.message = "100th upvote! 🎉";
      } else if (doc.score == 501) {
        activity.message = "500th upvote! 🤯";
      } else if (doc.score == 1001) {
        activity.message = "1000th upvote! 🤩";
      }
      if (activity.message !== "") {
        activity.message +=
          ' View your comment "' + smartTruncate(doc.text, 100) + '"';
        let query = await admin
          .firestore()
          .collection("Activity")
          .doc(activity.id)
          .set(activity);
      }
    }
  });

exports.newActivity = functions.firestore
  .document("Activity/{docId}")
  .onCreate(async (snap, context) => {
    console.log("newActivity fired");
    const doc = snap.data();

    let query = await admin
      .firestore()
      .collection("Users")
      .doc(doc.for_id)
      .get();

    if (query) {
      const user = query.data(); // <--- user the activity is for
      admin
        .firestore()
        .collection("UserInfo")
        .doc(user.id)
        .set(
          { activityCount: admin.firestore.FieldValue.increment(1) },
          { merge: true }
        );
      if (user.notificationsOn && user.tokens) {
        const tokens = user.tokens;
        const payload = {
          notification: {
            title: "Temenos Dream",
            body: smartTruncate(doc.message, 120),
          },
          data: {
            id: doc.id,
            from_id: doc.from_id,
            from_name: doc.from_name,
            from_pic: doc.from_pic,
            dreamId: doc.dreamId,
            commentId: doc.comment ? doc.comment.id : "",
          },
        };
        for (let i = 0; i < tokens.length; i++) {
          console.log("messaging: " + tokens[i]);
          admin
            .messaging()
            .sendToDevice(tokens[i], payload)
            .then((response) => {
              console.log("Successfully sent message:", response);
            })
            .catch((error) => {
              console.log("Error sending message:", error);
            });
        }
      }
    }
  });
