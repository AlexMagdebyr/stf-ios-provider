var syrup = require('stf-syrup')
var Promise = require('bluebird')
var url = require('url')
var util = require('util')
var logger = require('../../../util/logger')
var EventEmitter = require('eventemitter3')
var lifecycle = require('../../../util/lifecycle')
var fetch = require('node-fetch')
var FormData = require('form-data');
var { URLSearchParams } = require('url');

module.exports = syrup.serial()
.dependency(require('./vncControl'))
.define(function(options, vncControl){
    var log = logger.createLogger('device-ios:plugins:wdaCommands')
    var plugin = new EventEmitter()
    var baseUrl = util.format('http://localhost:%d',options.wdaPort)
    var sessionid = null
    var sessionTimer = null
    
    plugin.getSessionid = function(){
        if( sessionid == null ) {
            plugin.initSession()
            return null
        }
        return sessionid
    }

    plugin.initSession = function(){
        fetch( baseUrl + '/status', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        } )
        .then( res => res.json() )
        .then( json => {
            sessionid = json.sessionId;
        } )
        .catch( err => {
          log.error('Session renew "%s" failed',  baseUrl + '/status', err.stack)
        } )
    }

    plugin.click = function(x,y) {
        log.info('click at x:',x,'y:',y)
        if( options.vncPort ) {
          vncControl.click(x,y)
        }
        else {
          //plugin.PostData('wda/tapat',{x:x,y:y},true)
          plugin.PostData('wda/touch/perform',{"actions":[{"action":"tap","options":{"x":x,"y":y}}]},true)
          //plugin.PostData('wda/tap/0',{x:x,y:y},true)
        }
    }
    
    plugin.clickHold = function(x,y,seconds) {
        log.info('click and hold at x:',x,'y:',y)
        if( options.vncPort ) {
          vncControl.click(x,y)
        }
        else {
          plugin.PostData('wda/touchAndHold',{x:x,y:y,duration:seconds},true)
        }
    }

    plugin.swipe = function(swipeList,duration){
        var actions = [
            {
                action:"press",
                options:{
                    x:swipeList[0].x,
                    y:swipeList[0].y
                }
            }
        ]
        var time = duration
        if(swipeList.length>2){
            time = 50
        }
        for(i=1;i<swipeList.length;i++){
            actions.push(
                {
                    action:"wait",
                    options:{
                        ms:time
                    }
                }
            )
            actions.push(
                {
                    action:"moveTo",
                    options:{
                        x:swipeList[i].x,
                        y:swipeList[i].y
                    }
                }
            )
        }
        actions.push({
            action:"release",
            options:{}
        })
        var body = {
            actions:actions
        }
        plugin.PostData('wda/touch/perform_stf',body,false)
    }
    
    plugin.swipeViaDrag = function(x1,y1,x2,y2,duration) {
      if( options.vncPort ) {
        vncControl.drag(x1,y1,x2,y2)
      }
      else {
        //plugin.PostData('wda/dragat', { x1: x1, y1: y1, x2: x2, y2: y2 }, true );
          
        var body = {
          "actions": [
            {
              "action": "press",
              "options": {
                "x": Math.floor(x1),
                "y":Math.floor(y1)
              }
            },
            {
              "action":"wait",
              "options": {
                "ms": 500
              }
            },
            {
              "action": "moveTo",
              "options": {
                "x": Math.floor(x2),
                "y":Math.floor(y2)
              }
            },
            {
              "action":"release",
              "options":{}
            }
          ]
        };
        plugin.PostData( "wda/touch/perform", body , true );
      }        
    }

    plugin.launchApp = function(bundleId){
        var body = {
            desiredCapabilities:{
                bundleId:bundleId
            }
        }
        plugin.PostData('session',body,false)
    }

    function processResp(resp){
        var respValue = resp.value
        if(respValue=={}||respValue==null||respValue=="")
            return
        if(respValue.func==undefined)
            return
        return plugin.emit(respValue.func,respValue)
    }

    plugin.PostData = function( uri, body, useSession, handler ) {
        var sessionPath = useSession ? util.format("/session/%s",plugin.getSessionid()) : '';
        var url = util.format("%s%s/%s", baseUrl, sessionPath, uri );
        
        return new Promise( function( resolve, reject ) {
            fetch( url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify( body )
            } )
            .then( res => {
                if( res.status < 200 || res.status >= 300 ) {
                    if( handler ) {
                        if( handler == 1 ) resolve( res.status );
                        else handler( { success: false, status: res.status } );
                    }
                    
                    log.warn( "posting %s to:", JSON.stringify( body ), url, "status code:", res.status )
                }
                else {
                    res.json().then( json => {
                        log.info('POST to URL:%s, Response:%s', url, JSON.stringify( json ) )
                        if( handler ) {
                            if( handler == 1 ) resolve( json );
                            else handler( { success: true, json: json } );
                        }
                        else processResp( json );
                    } )
                }
            } )
            .catch( err => {
                if( handler && handler == 1 ) reject();
                log.error("Post %s to URL:%s", JSON.stringify( body ), url)
            } )
        } );
    }

        plugin.launchAppReturnSession = async function(bundleId){
        var body = {
            capabilities:{
                alwaysMatch:{
                    bundleId:bundleId,
                    udid:''
                }
            }
        }

        /*
        var body = {
            bundleId
        }

        var uri = "wda/apps/launch"
        var sessionPath = util.format("/session/%s",plugin.getSessionid());
        var url = util.format("%s%s/%s", baseUrl, sessionPath, uri );
        */

        var url = util.format("%s/session", baseUrl );
        
        return await fetch( url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify( body )
        } )
        .then( res => res.json())
        .then( json => {
            log.info('SAFARI SESSION ID %s', json.sessionId )
            return json.sessionId
        } )
        /*
        .then( res => {
            if( res.status < 200 || res.status >= 300 ) {
                log.warn("posting %s to:", JSON.stringify( body ), url, "status code:", res.status)
            }
            else {
                res.json().then( json => {
                    log.info('SAFARI SESSION ID %s', json.sessionId )
                    log.info('POST to URL:%s, Response:%s', url, JSON.stringify( json ) )
                    processResp( json );
                    return json.sessionId
                } )
            }
        } )
        */
        .catch( err => {
            log.error("Post %s to URL:%s", JSON.stringify( body ), url)
        } )
    }

    plugin.openUrlInSafari = async function(url) {
        var safariSessionId = await plugin.launchAppReturnSession(options.bundleidCompanion)
        log.info('----launch Companion DONE %s', safariSessionId)

        if (safariSessionId == null) {
            return
        }

        var count = 0
        var elementId = null
        while (elementId == null && count < 10) {
            await new Promise(r => setTimeout(r, 100));
            elementId = await getElement(safariSessionId, "value=URL")
            count++
        }
        log.info('----getElement SearchBar DONE %s', elementId)

        if (elementId == null) {
            return
        }

        await new Promise(r => setTimeout(r, 100));
        await clickOnElement(safariSessionId, elementId)
        log.info('----clickOnElement SearchBarButton DONE')

        count = 0
        var fieldElementId = null
        while (fieldElementId == null && count < 10) {
            await new Promise(r => setTimeout(r, 500));
            fieldElementId = await getElement(safariSessionId, "value=URL")
            count++
        }
        log.info('----getElement SearchBar DONE %s', elementId)
        
        if (fieldElementId == null) {
            return
        }

        await new Promise(r => setTimeout(r, 100));
        await sendKeyToElement(safariSessionId, fieldElementId, url)
        log.info('----sendKeyToElement SearchBarField DONE')
    }

    async function sendKeyToElement(sessionId, elementId, value) {
        var body = {
            value: [value+"\n"]
        }

        var url = util.format("%s/session/%s/element/%s/value", baseUrl, sessionId, elementId );

        return await fetch( url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify( body )
        } )
        .then( res => {
            if( res.status < 200 || res.status >= 300 ) {
                log.warn("posting %s to:", JSON.stringify( body ), url, "status code:", res.status)
            }
            else {
                res.json().then( json => {
                    log.info('POST to URL:%s, Response:%s', url, JSON.stringify( json ) )
                    processResp( json );
                } )
            }
        } )
        .catch( err => {
            log.error("Post %s to URL:%s", JSON.stringify( body ), url)
        } )
    }    

    async function clickOnElement(sessionId, elementId) {
        var body = ""

        var url = util.format("%s/session/%s/element/%s/click", baseUrl, sessionId, elementId );

        return await fetch( url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify( body )
        } )
        .then( res => {
            if( res.status < 200 || res.status >= 300 ) {
                log.warn("posting %s to:", JSON.stringify( body ), url, "status code:", res.status)
            }
            else {
                res.json().then( json => {
                    log.info('POST to URL:%s, Response:%s', url, JSON.stringify( json ) )
                    processResp( json );
                } )
            }
        } )
        .catch( err => {
            log.error("Post %s to URL:%s", JSON.stringify( body ), url)
        } )
    }    

    async function getElement(sessionId, value) {
        var body = {
            using: "partial link text",
            value: value
        }

        var url = util.format("%s/session/%s/element", baseUrl, sessionId );

        return await fetch( url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify( body )
        } )
        .then( res => res.json())
        .then( json => {
            log.info('ELEMENT ID %s', json.value.ELEMENT )
            return json.value.ELEMENT
        } )
        /*
        .then( res => {
            if( res.status < 200 || res.status >= 300 ) {
                log.warn("posting %s to:", JSON.stringify( body ), url, "status code:", res.status)
            }
            else {
                res.json().then( json => {
                    log.info('ELEMENT ID %s', json.value.ELEMENT )
                    log.info('POST to URL:%s, Response:%s', url, JSON.stringify( json ) )
                    processResp( json );
                    return json.value.ELEMENT
                } )
            }
        } )
        */
        .catch( err => {
            log.error("Post %s to URL:%s", JSON.stringify( body ), url)
        } )
    }    

    plugin.GetRequest = function( uri, param='', useSession=false, callback ) {
        var sessionPath = useSession ? util.format("/session/%s",plugin.getSessionid()) : '';
        var url = util.format( "%s%s/%s%s", baseUrl, sessionPath, uri, param );
        
        fetch( url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        } )
        .then( res => {
            if( res.status < 200 || res.status >= 300 ) {
                log.warn("GET from:", uri, "status code:", res.status)
            }
            else {
                res.json().then( json => {
                    log.info('Get - URL:%s, Response:%s', url, JSON.stringify( json ) )
                    if( callback ) {
                        callback( json );
                    }
                    else processResp( json );
                } )
            }
        } )
        .catch( err => {
            log.error("Get - URL:%s", url)
        } )
    }

    sessionTimer = setInterval(plugin.initSession, 30000);

    lifecycle.observe(function() {
        clearInterval(sessionTimer)
        return true
    })

    return plugin
})