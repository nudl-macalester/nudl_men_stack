var express = require('express');
var path = require('path');
var passport = require('passport');
var session = require('express-session');
var MongoStore = require('connect-mongo')(session);
var db = require('./database.js');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var flash = require('connect-flash');
var logger = require('morgan');
var fs = require('fs');
var mail = require('./mail');
var verification = require('./passport');
var http = require('http');

// Express setup
var app = express();
var server = http.createServer(app);

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(session({
    secret: 'PlaneChatSuperSecret',
    resave: false,
    saveUninitialized: false//,
    // store: new MongoStore({
    //     mongooseConnection: db,
    //     ttl: 14 * 24 * 60 * 60,
    //     touchAfter: 24 * 3600
    // })
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(cookieParser());
app.use(flash());
//app.use(app.router);

verification.setup(passport);



// routes
app.post('/signin', passport.authenticate('local-login',
    {
        successRedirect: '/home/',
        failureRedirect: '/',
        failureFlash: true
    }
));

app.post('/signup', passport.authenticate('local-signup',
    {
        successRedirect: '/home/',
        failureRedirect: '/',
        failureFlash: true
    }
));

app.get('/signout', function(req, res) {
    req.logout();
    res.redirect('/');
});

app.get('/verify', verification.runVerification);

app.post('/forgotpassword/:userEmail', function(req, res) {
    var userEmail = req.params('userEmail');
    db.User.find({email: userEmail}, function(err, user) {
        if (err) {
            console.log(err);
            return;
        }

        if (!user) {
            res.status(404)
                .send("email address not found!");
        }
        res.status(200)
            .send("recovery email sent!");
    });
});

app.get('/password_recovery/:hash', function(req, res) {
    res.status(200)
        .send("recovered!");
});

app.get('/home/', isLoggedIn, function(req, res) {
    var userId = req.user._id;
    var allMealsharesString = null;
    var createdMealsharesString = null;
    var attendingMealsharesString = null;
    var hostingMealsharesString = null;

    var homeDocPath = path.join(process.cwd(), '/public/home/index.html');

    db.Mealshare.find({}, function(err, mealshares) {
        if (err) {
            console.log(err);
            return;
        }
        var createdMealshares = [];
        var attendingMealshares = [];
        var hostingMealshares = [];

        for (var i = 0; i < mealshares.length; i++) {
            var mealshare = mealshares[i];
            if (mealshare.creator.toString() == userId.toString())
                createdMealshares.push(mealshare);
            else if (mealshare.guests && mealshare.guests.indexOf(userId) != -1)
                attendingMealshares.push(mealshare);
            else if (mealshare.hosts && mealshare.hosts.indexOf(userId) != -1)
                hostingMealshares.push(mealshare);
        }
        fs.readFile(homeDocPath, 'utf8', 'r+', function(err, homeDoc) {
            if (err) {
                conosole.log(err);
                return;
            }
            allMealsharesString = "var allMealshares = " + JSON.stringify(mealshares) + ";";
            createdMealsharesString = "var createdMealshares = " + JSON.stringify(createdMealshares) + ";";
            attendingMealsharesString = "var attendingMealshares = " + JSON.stringify(attendingMealshares) + ";";
            hostingMealsharesString = "var hostingMealshares = " + JSON.stringify(hostingMealshares) + ";";

            homeDoc = homeDoc.replace(/ALLMEALSHARESHERE/g, allMealsharesString);
            homeDoc = homeDoc.replace(/CREATEDMEALSHARESHERE/g, createdMealsharesString);
            homeDoc = homeDoc.replace(/ATTENDINGMEALSHARESHERE/g, attendingMealsharesString);
            homeDoc = homeDoc.replace(/HOSTINGMEALSHARESHERE/g, hostingMealsharesString);
            res.send(homeDoc);
        })

    })
});

// mealshare edit/create/delete routes
app.post('/mealshare/new', isLoggedIn, function(req, res) {
    var creatingUser = req.user;

    var nMS = new db.Mealshare();

    nMS.creator = creatingUser;
    nMS.name = req.body.name;
    nMS.description = req.body.description;
    nMS.hosts.push(creatingUser);
    nMS.max_guests = req.body.max_guests;
    nMS.time = new Date();
    // nMS.hosts = req.body.hosts;
    // nMS.guests = req.body.guests;
    nMS.save(function(err) {
        if (err)
            res.status(500)
                .send("Error saving new mealshare");
        creatingUser.created_mealshares.push(nMS._id);
        creatingUser.save();
        res.status(200)
            .send(nMS);
    });
});

app.put('/mealshare/attend/:mealshareId', isLoggedIn, function(req, res) {
    var attendingUser = req.user;
    var mealshareId = req.param("mealshareId");

    db.Mealshare.findById(mealshareId, function(err, mealshare) {
        if (err) {
            console.log(err);
            return;
        }
        mealshare.guests.push(attendingUser._id);
        mealshare.save(function(err) {
            if (err) {
                console.log(err);
                return;
            }
            res.status(200)
                .send(mealshare);
        });
    });

});

app.put('/mealshare/host/:mealshareId', isLoggedIn, function(req, res) {
    var hostingUser = req.user;
    var mealshareId = req.param("mealshareId");

    db.Mealshare.findById(mealshareId, function(err, mealshare) {
        if (err) {
            console.log(err);
            return;
        }
        mealshare.hosts.push(hostingUser._id.toString());
        mealshare.save(function(err) {
            if (err) {
                console.log(err);
                return;
            }
            res.status(200)
                .send(mealshare);
        });
    });
});

app.put('/mealshare/unattend/:mealshareId', isLoggedIn, function(req, res) {
    var unattendingUser = req.user;
    var mealshareId = req.param("mealshareId");

    db.Mealshare.findById(mealshareId, function(err, mealshare) {
        if (err) {
            console.log(err);
            return;
        }
        var uIndex = mealshare.guests.indexOf(unattendingUser._id);
        if (uIndex != -1)
            mealshare.guests.splice(uIndex, 1);

        mealshare.save(function(err) {
            if (err) {
                console.log(err);
                return;
            }
            res.status(200)
                .send(mealshare);
        });
    });
});

app.put('/mealshare/unhost/:mealshareId', isLoggedIn, function(req, res) {
    var unhostingUser = req.user;
    var mealshareId = req.param("mealshareId");

    db.Mealshare.findById(mealshareId, function(err, mealshare) {
        if (err) {
            console.log(err);
            return;
        }
        var uIndex = mealshare.hosts.indexOf(unhostingUser._id);
        if (uIndex != -1)
            mealshare.hosts.splice(uIndex, 1);

        mealshare.save(function(err) {
            if (err) {
                console.log(err);
                return;
            }
            res.status(200)
                .send(mealshare);
        });
    });
});

// route middleware to make sure
function isLoggedIn(req, res, next) {
    if (req.isAuthenticated() && req.user.verified) {
        return next();
    }

    if(req.user && !req.user.verified) {
        res.end('Please verify your account.');
        return;
    }

    res.redirect('/');
}

// Middleware for authentication:
app.use(express.static(path.join(process.cwd(), '/public')));

server.listen(3000, function() {
    console.log("Listening on port 3000");
});
