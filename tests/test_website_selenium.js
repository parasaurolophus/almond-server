// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond Cloud
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

// load thingpedia to initialize the polyfill
require('thingpedia');
process.on('unhandledRejection', (up) => { throw up; });

const assert = require('assert');
const Tp = require('thingpedia');

const WD = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const firefox = require('selenium-webdriver/firefox');

const BASE_URL = `http://127.0.0.1:${process.env.PORT}`;

async function withSelenium(test) {
    const builder = new WD.Builder()
        .forBrowser('firefox');

    // on Travis CI we run headless; setting up Xvfb is
    // just annoying and not very useful
    if (process.env.TRAVIS) {
        builder
        .setFirefoxOptions(
            new firefox.Options().headless()
        )
        .setChromeOptions(
            new chrome.Options().headless()
        );
    }

    const driver = builder.build();
    try {
        await test(driver);
    } finally {
        driver.quit();
    }
}

const _checkedImages = new Set;

/**
 * Check that all images have URLs that return a valid image
 * (valid HTTP status and valid content-type).
 */
async function checkAllImages(driver) {
    const currentUrl = await driver.getCurrentUrl();
    const images = await driver.findElements(WD.By.css('img'));

    await Promise.all(images.map(async (img) => {
        const src = await img.getAttribute('src');

        // small optimization: we only check an image once
        // (we don't have dynamic images)
        // (we still need to use selenium to check images rather than
        // a linkchecker-style approach to make sure we catch JS-added
        // images)
        if (_checkedImages.has(src))
            return;
        _checkedImages.add(src);

        // this is not exactly what the browser does
        const res = await Tp.Helpers.Http.getStream(src, { extraHeaders: {
            Referrer: currentUrl
        }});
        assert(res.headers['content-type'].startsWith('image/'),
               `expected image/* content type for image, found ${res['content-type']}`);
        res.resume();
    }));
}

/*async function fillFormField(driver, id, ...value) {
    const entry = await driver.findElement(WD.By.id(id));
    await entry.sendKeys(...value);
}*/

async function testHomepage(driver) {
    await driver.get(BASE_URL + '/');

    const title = await driver.wait(
        WD.until.elementLocated(WD.By.css('.jumbotron.text-center > h1')),
        30000);
    await checkAllImages(driver);

    assert.strictEqual(await title.getText(), 'It works!');
}


async function testMyConversation(driver) {
    await driver.get(BASE_URL + '/conversation');

    const inputEntry = await driver.wait(
        WD.until.elementLocated(WD.By.id('input')),
        30000);
    await checkAllImages(driver);

    // wait some extra time for the almond thread to respond
    await driver.sleep(5000);

    let messages = await driver.findElements(WD.By.css('.message'));
    assert.strictEqual(messages.length, 1);
    assert.strictEqual(await messages[0].getText(), `Welcome back!`);

    await inputEntry.sendKeys('no', WD.Key.ENTER);

    const ourInput = await driver.wait(
        WD.until.elementLocated(WD.By.css('.message.from-user:nth-child(2)')),
        10000);
    assert.strictEqual(await ourInput.getText(), 'no');

    const response = await driver.wait(
        WD.until.elementLocated(WD.By.css('.from-almond:nth-child(3) .message')),
        10000);
    assert.strictEqual(await response.getText(), 'No way!');

    /*await inputEntry.sendKeys('hello', WD.Key.ENTER);

    const ourInput2 = await driver.wait(
        WD.until.elementLocated(WD.By.css('.message.from-user:nth-child(3)')),
        10000);
    assert.strictEqual(await ourInput2.getText(), 'hello');

    const response2 = await driver.wait(
        WD.until.elementLocated(WD.By.css('.from-almond:nth-child(4) .message')),
        10000);
    assert.strictEqual(await response2.getText(), 'Hi!');*/
}

async function main() {
    await withSelenium(testHomepage);
    await withSelenium(testMyConversation);
}
module.exports = main;
if (!module.parent)
    main();
