import "./styles/app.css";
import "./styles/flightindicators.css";

import {JetApp, StoreRouter} from "webix-jet";
import io_service from './plugins/SocketIoService';

// Joystick
import nipplejs from "nipplejs";
import {EventEmitter} from "events";

//
// On webix loaded and ready
webix.ready(() => {

	//
	// new app constructor
	const app = new JetApp({
		start: "/app/control_tower"
		,router: StoreRouter
		,debug: true // FIXME
	});

	window.app = app;

	//
	//error handlers
	webix.attachEvent("onLoadError", function(text, xml, ajax, owner){
		console.log("ajax error");

		const resp = JSON.parse(text);

		if( resp && resp.status ){
			if( "unauthorized" === resp.status ){
				console.log("unauthorized GO TO LOGIN");
				//app.getService("auth").logout();
			}
		}
	});
	app.attachEvent("app:error:resolve", function(name, error){
		window.console.error("app:error:resolve");
		window.console.error(error);
	});
	app.attachEvent("app:error:initview", function(view, error){
		window.console.error("app:error:initview");
		window.console.error(error);
	});
	app.attachEvent("app:error:server", function(error){
		window.console.error("app:error:server");
		webix.alert({
			width: 450,
			title:"Data saving error",
			text: "Please try to repeat the action <br> if error still occurs, please try to reload the page."
		});
	});

	//
	// Socket.io Plugin
	app.use(io_service, {});
	app.getService('io').connect(); // returns Promise

	//
	// Render app
	app.render().then(function(){
		// Connect to socket.io
		//app.getService('io').connect(); // returns Promise
	});

	window.addEventListener("gamepadconnected", function(e) {
		console.log("Gamepad connected at index %d: %s. %d buttons, %d axes.",
			e.gamepad.index, e.gamepad.id,
			e.gamepad.buttons.length, e.gamepad.axes.length);
	});

	window.addEventListener("gamepaddisconnected", function(e) {
		console.log("Gamepad disconnected from index %d: %s",
			e.gamepad.index, e.gamepad.id);
	});



});


//
// Определение дополнительных виджетов

// Джойстик
webix.protoUI({
	name: "joystick" // the name of a new component
	,defaults:{
		width: 150
		,height: 150
		,size: 150
	},
	$init: function(config){

		this.j_id = config.j_id;
		this.color = config.color || 'red';

		this.$view.innerHTML = '<div class="joystick" id=' + config.j_id + '></div>';

		let el = this.$view.querySelector('#' + config.j_id);

		this.controller = function(xy){};

		this.$ready.push(function(){
			if( el ){
				el.style.width = "150px";
				el.style.height = "150px";
			}
		});
	}

	,showJoystick: function(){

		const _this = this;

		let el = this.$view.querySelector('#' + this.j_id);

		const joystick = nipplejs.create({
			zone: el,
			mode: "static",
			position: {left: "50%", top: "50%"},
			color: _this.color
		});

		joystick.on("move", function(e, data){
			let x = data.position.x - joystick[0].position.x;
			let y = joystick[0].position.y - data.position.y;

			_this.controller({x: x, y: y});

		});

		joystick.on("end", function(e, data){
			_this.controller({x: 0, y: 0});
		});

	}

	,setController: function(controller){
		this.controller = controller;
	}

}, webix.ui.view);


// Active list
webix.protoUI({
	name:"activeList"
}, webix.ui.list, webix.ActiveContent);


// Горизонт
webix.protoUI({
	name: "fi_horizon" // the name of a new component
	,defaults:{
		width: 200
		,size: 200
	},

	$init: function(config){
		let img_dir = "static/fi/";
		this.$view.innerHTML = '<div class="instrument attitude"><div class="roll box"><img src="' + img_dir + 'horizon_back.svg" class="box" alt="" /><div class="pitch box"><img src="' + img_dir + 'horizon_ball.svg" class="box" alt="" /></div><img src="' + img_dir + 'horizon_circle.svg" class="box" alt="" /></div><div class="mechanics box"><img src="' + img_dir + 'horizon_mechanics.svg" class="box" alt="" /><img src="' + img_dir + 'fi_circle.svg" class="box" alt="" /></div></div>';

		const _this = this;

		this.$ready.push(function(){
			let el = _this.$view.querySelectorAll("div.instrument")[0];
			if( el ){
				el.style.width = config.size + "px";
				el.style.height = config.size + "px";
			}
		});
	}

	,bind: function(dataRecord){
		let eventId = null;
		eventId = dataRecord.attachEvent('onChange', rec => {
			if( !this.$view ){
				if( eventId ) dataRecord.detachEvent(eventId);
				eventId = null;
				return;
			}

			let roll_el = this.$view.querySelectorAll("div.instrument.attitude div.roll")[0];
			let pitch_el = this.$view.querySelectorAll("div.instrument.attitude div.roll div.pitch")[0];

			if( !roll_el || !pitch_el ) return;

			let roll = parseInt(rec.roll);
			if( isNaN(roll) ) roll = 0;
			let pitch = parseInt(rec.pitch);
			if( isNaN(pitch) ) pitch = 0;

			roll_el.style.transform = "rotate(" + -roll + "deg)";
			pitch_el.style.top = pitch*0.7 + "%";
		});
	}

}, webix.ui.view);


// Компас
webix.protoUI({
	name: "fi_compass" // the name of a new component
	,defaults:{
		width: 200
		,size: 200
	},
	$init: function(config){
		let img_dir = "static/fi/";
		this.$view.innerHTML = '<div class="instrument heading"><div class="heading box"><img src="' + img_dir + 'heading_yaw.svg" class="box" alt="" /></div><div class="mechanics box"><img src="' + img_dir + 'heading_mechanics.svg" class="box" alt="" /><img src="' + img_dir + 'fi_circle.svg" class="box" alt="" /></div></div>';

		const _this = this;

		this.$ready.push(function(){
			let idiv = _this.$view.querySelectorAll("div.instrument")[0];
			if( idiv ){
				idiv.style.width = config.size + "px";
				idiv.style.height = config.size + "px";
			}
		});
	}

	,bind: function(dataRecord){
		let eventId = null;
		eventId = dataRecord.attachEvent('onChange', rec => {
			if( !this.$view ){
				if( eventId ) dataRecord.detachEvent(eventId);
				eventId = null;
				return;
			}
			let el = this.$view.querySelectorAll("div.instrument.heading div.heading")[0];
			if( el ){
				let heading = parseInt(rec.yaw);
				if( isNaN(heading) ) heading = 0;
				el.style.transform = "rotate(" + -heading + "deg)";
			}
		});
	}

	/*
    ,$getSize: function(x, y){}
    ,$setSize:function(x, y){
        // this.$view.childNodes[i].style.width = ''
    }
    */
}, webix.ui.view);


// Виджет телеметрии
webix.protoUI({
	name: "telem_widget" // the name of a new component
	,defaults:{
		width: 100,
		height: 54
		//,on:{'onItemClick' : function(){}} //attached events
	},
	$init: function(config){
		this.init_config = config;
		this.$view.className += " telem_widget";
		this.current_icon = config.icon || "close";
		this.state = "normal";

		let inner_html = '';
		inner_html += `<div class="t_elem t_elem_plain" webix_tooltip="${(config.tooltip || "")}">`;
		inner_html += `<span class="webix_icon mdi mdi-${this.current_icon}"></span>`;
		if( config.value !== false ) inner_html += `<span class="value">--</span>`;
		if( config.label !== false ) inner_html += `<span class="label">${(config.label || "")}</span>`;

		inner_html += '</div>';

		this.$view.innerHTML = inner_html;

		const _this = this;

		this.$ready.push(function(){
			let idiv = _this.$view.querySelectorAll("div.t_elem")[0];
			if( idiv ){
				if( config.width  ) idiv.style.width = config.width-20 + "px";
				if( config.clickable === true ){
					idiv.classList.add('t_elem_clickable');

					idiv.addEventListener("click", () => _this.callEvent('onItemClick') );
				}

				if( config.state ){
					_this.setState(config.state);
				}

				webix.TooltipControl.addTooltip(_this.$view);
			}
		});
	}

	,setValue: function(value){
		let el = this.$view.querySelectorAll("div.t_elem span.value")[0];

		if( el ){
			el.innerHTML = this.parseValue(value);
		}
	}

	,setLabel: function(label){
		let el = this.$view.querySelectorAll("div.t_elem span.label")[0];

		if( el ){
			if( !label ) label = "";
			el.innerHTML = label + "";
		}
	}

	,getState: function(){
		return this.state;
	}

	// normal, warn, danger, active
	,setState: function(state='normal'){ // warn, danger

		this.state = state;

		let idiv = this.$view.querySelectorAll("div.t_elem")[0];
		if( !idiv ) return;

		if( 'warn' === state ){
			idiv.classList.add('t_elem_warn');
			idiv.classList.remove('t_elem_plain', 't_elem_danger', 't_elem_active');
		}
		else if( 'danger' === state ){
			idiv.classList.add('t_elem_danger');
			idiv.classList.remove('t_elem_plain', 't_elem_warn', 't_elem_active');
		}
		else if( 'active' === state ){
			idiv.classList.add('t_elem_active');
			idiv.classList.remove('t_elem_plain', 't_elem_warn','t_elem_danger');
		}
		else {
			idiv.classList.add('t_elem_plain');
			idiv.classList.remove('t_elem_danger', 't_elem_warn', 't_elem_active');
		}

	}

	,setIcon: function(icon){
		let icon_el = this.$view.querySelectorAll("span.webix_icon")[0];
		if( !icon_el ) return;

		icon_el.classList.remove("mdi-" + this.current_icon);
		icon_el.classList.add("mdi-" + icon);
		this.current_icon = icon;
	}

	,connectDataRecord: function(dataRecord, field){
		let eventId = null;
		eventId = dataRecord.attachEvent('onChange', rec => {
			if( !this.$view ){
				if( eventId ) dataRecord.detachEvent(eventId);
				eventId = null;
				return;
			}

			let el = this.$view.querySelectorAll("div.t_elem span.value")[0];
			if( !el ) return;

			let value = rec[field];
			if( value === null || value === undefined ) value = '??';
			el.innerHTML = this.parseValue(value);
		});
	}

	// Redefine in view init
	,parseValue: function(value){
		return value + '';
	}

}, webix.ui.view, webix.EventSystem );


window.SLDPH = function(){

	let event_controller = new EventEmitter();

	return {
		on: function(event, handler){
			return event_controller.on(event, handler);
		}
		,emit: function(event, data=null){
			return event_controller.emit(event, data);
		}
		,reset: function(){
			event_controller.removeAllListeners();
		}
	};
}();


//
// FIXME Предупреждение перед закрытием окна пользователем
//window.onbeforeunload = function() {
//	return "Are you sure to exit?";
//};
