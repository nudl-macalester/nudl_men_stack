var LocalStrategy = require('passport-local').Strategy;
var bcrypt = require('bcrypt');
var database = require('./database');
var mail = require('./mail');

var url = "http://0.0.0.0:3000";

module.exports.setup = function(passport) {
// Passport setup

    passport.serializeUser(function(user, done) {
        done(null, user._id);
    });

    passport.deserializeUser(function(id, done) {
        database.User.findById(id, function(err, user) {
            done(err, user);
        });
    });

    passport.use('local-signup', new LocalStrategy({
                usernameField:'name',
                passwordField: 'password',
                passReqToCallback: true
            },

            function (req, username, password, done) {
                var email = req.body.email;
                database.User.findOne({ name: username }, function(err, user) {
                    if (err) {
                        return done(err);
                    }
                    if (user) {
                        return done(err, false, {message: 'name taken'});
                    } else {
                        var nUser = new database.User();

                        bcrypt.genSalt(10, function(err, salt) {
                            bcrypt.hash(password, salt, function(err, hash) {
                                if (err)
                                    return done(err);

                                nUser.name = username;
                                nUser.email = email;
                                nUser.password = hash;

                                // TODO: CHANGE THIS TO FALSE TO REQUIRE EMAIL VERIFICATION!!!
                                nUser.verified = true;

                                nUser.save(function(err) {
                                    if (err)
                                        return done(err);

                                    if(!nUser.verified) {
                                        database.Verif.generateForUser(nUser, function (err, verif) {
                                            sendEmailVerification(nUser, verif._id);
                                        });
                                    }
                                    return done(null, nUser);
                                })
                            });
                        });
                    }
                });
            }
        )
    );

    passport.use('local-login', new LocalStrategy(
        {
            usernameField: 'email',
            passwordField: 'password'
        },
        function(username, password, done) {
            database.User.findOne({ email: username }, function (err, user) {
                if (err) {
                    return done(err);
                }
                if (!user) {
                    return done(null, false, {message: 'email not found'});
                } else {
                    bcrypt.compare(password, user.password, function(err, equal) {
                        if (err) {
                            return done(err);
                        }
                        if(!equal) {
                            return done(null, false, {message: 'wrong password for this username'});
                        }

                        return done(null, user);
                    });
                }
            });
        }
    ));
};

function sendEmailVerification(user, vid) {
    mail.send({
        to: user.email,
        subject: "Welcome to NUDL",
        body:'Hi!<br/><br/>Please follow the link below to verify your account on NUDL:<br/><a href="' + url + '/verify?tok=' + vid + '">Verify Account</a><br/><br/>Cheers,<br/>The PlaneChat Team'
    });
}

module.exports.runVerification = function(req, res) {
    var tok = req.param('tok');

    console.log(tok);
    database.Verif.attemptVerification(tok, function(err, note, verif) {
        if(err) {
            res.status(500);
            res.end("Internal server error!");
            return;
        }

        if(!verif) {
            console.log(note);
            res.end("I'm afraid I can't find a user verification with that token.");
            return;
        }

        if(verif.user.verified) {
            res.end("That user is already verified!");
            return;
        }

        if(note) {
            res.end(note);
            return;
        }

        verif.user.verified = true;
        verif.user.save();

        verif.remove();

        res.end("Thank you for registering with NUDL.");
    });
};
