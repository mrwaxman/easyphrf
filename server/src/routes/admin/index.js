'use strict';

const express = require('express');
const { resolveClub } = require('../../middleware/clubContext');
const boatsRouter = require('./boats');
const racesRouter = require('./races');
const seriesRouter = require('./series');

const router = express.Router();

// Every admin route operates within a club context (header or query param).
router.use(resolveClub);

router.use('/boats', boatsRouter);
router.use('/races', racesRouter);
router.use('/series', seriesRouter);

module.exports = router;
