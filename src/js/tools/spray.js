import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';

/**
 * Spray paint (airbrush) tool.
 * Based on the Pencil tool: same vector-layer approach, but instead of saving
 * points of a line, every mouse move (and a timer while the button is held)
 * adds a burst of random dots inside a circle around the cursor.
 * Dot positions are saved in layer.data, so the layer re-renders the same way every time.
 */
class Spray_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.name = 'spray';
		this.layer = {};
		this.params_hash = false;
		this.timer = null; // keeps spraying while mouse is held still
		this.last_x = 0; // last mouse x on canvas
		this.last_y = 0; // last mouse y on canvas
	}

	load() {
		this.default_events();
	}

	mousedown(e) {
		var mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false)
			return;

		var params_hash = this.get_params_hash();
		var opacity = Math.round(config.ALPHA / 255 * 100);

		if (config.layer.type != this.name || params_hash != this.params_hash) {
			//register new object - current layer is not ours or params changed
			this.layer = {
				type: this.name,
				data: [],
				opacity: opacity,
				params: this.clone(this.getParams()),
				status: 'draft',
				render_function: [this.name, 'render'],
				x: 0,
				y: 0,
				width: config.WIDTH,
				height: config.HEIGHT,
				hide_selection_if_active: true,
				rotate: null,
				is_vector: true,
				color: config.COLOR
			};
			app.State.do_action(
				new app.Actions.Bundle_action('new_spray_layer', 'New Spray Layer', [
					new app.Actions.Insert_layer_action(this.layer)
				])
			);
			this.params_hash = params_hash;
		}
		else {
			//continue adding dots to same layer - register a history step so undo works per stroke
			const new_data = JSON.parse(JSON.stringify(config.layer.data)); // copy of existing dots
			app.State.do_action(
				new app.Actions.Bundle_action('update_spray_layer', 'Update Spray Layer', [
					new app.Actions.Update_layer_action(config.layer.id, {
						data: new_data
					})
				])
			);
		}

		this.last_x = mouse.x;
		this.last_y = mouse.y;
		this.spray_burst();

		//keep spraying while mouse is held in one place
		var _this = this;
		clearInterval(this.timer);
		this.timer = setInterval(function () {
			_this.spray_burst();
		}, 50);
	}

	mousemove(e) {
		var mouse = this.get_mouse_info(e);
		if (mouse.is_drag == false)
			return;
		if (mouse.click_valid == false)
			return;
		if (this.timer == null)
			return;

		//fast mouse moves skip pixels, so spray extra bursts along the path to avoid gaps
		var params = this.getParams();
		var dist_x = mouse.x - this.last_x; // horizontal move since last burst
		var dist_y = mouse.y - this.last_y; // vertical move since last burst
		var distance = Math.sqrt(dist_x * dist_x + dist_y * dist_y); // move length in px
		var step = Math.max(1, params.radius / 2); // spacing between bursts
		var steps = Math.max(1, Math.ceil(distance / step)); // bursts needed for this move
		var start_x = this.last_x; // where this move started
		var start_y = this.last_y;

		for (var i = 1; i <= steps; i++) {
			this.last_x = start_x + dist_x * i / steps;
			this.last_y = start_y + dist_y * i / steps;
			this.spray_burst();
		}
	}

	mouseup(e) {
		if (this.timer == null)
			return;
		clearInterval(this.timer);
		this.timer = null;

		this.check_dimensions();
		config.layer.status = null;
		this.Base_layers.render();
	}

	/**
	 * adds random dots inside a circle around last mouse position
	 */
	spray_burst() {
		if (config.layer.type != this.name)
			return;

		var params = this.getParams();
		var radius = params.radius; // spray circle radius in px
		var density = params.density; // dots added per burst

		for (var i = 0; i < density; i++) {
			// random angle + sqrt(random) radius = even spread over the circle area
			var angle = Math.random() * Math.PI * 2; // direction from center
			var dist = Math.sqrt(Math.random()) * radius; // distance from center
			var x = Math.round(this.last_x + Math.cos(angle) * dist - config.layer.x); // dot x inside layer
			var y = Math.round(this.last_y + Math.sin(angle) * dist - config.layer.y); // dot y inside layer
			config.layer.data.push([x, y]);
		}
		this.Base_layers.render();
	}

	render(ctx, layer) {
		if (layer.data.length == 0)
			return;

		var data = layer.data; // list of [x, y] dots
		var dot_size = layer.params.dot_size; // size of each dot in px

		ctx.fillStyle = layer.color;
		ctx.translate(layer.x, layer.y);

		for (var i = 0; i < data.length; i++) {
			ctx.fillRect(data[i][0], data[i][1], dot_size, dot_size);
		}

		ctx.translate(-layer.x, -layer.y);
	}

	/**
	 * recalculate layer x, y, width and height values (same idea as pencil tool).
	 */
	check_dimensions() {
		if (config.layer.data.length == 0)
			return;

		var data = JSON.parse(JSON.stringify(config.layer.data)); // deep copy for history
		var dot_size = config.layer.params.dot_size; // dots are drawn this wide
		var min_x = data[0][0]; // left edge
		var min_y = data[0][1]; // top edge
		var max_x = data[0][0]; // right edge
		var max_y = data[0][1]; // bottom edge
		for (var i = 0; i < data.length; i++) {
			min_x = Math.min(min_x, data[i][0]);
			min_y = Math.min(min_y, data[i][1]);
			max_x = Math.max(max_x, data[i][0]);
			max_y = Math.max(max_y, data[i][1]);
		}

		//move dots so layer starts at 0,0
		for (var i = 0; i < data.length; i++) {
			data[i][0] = data[i][0] - min_x;
			data[i][1] = data[i][1] - min_y;
		}

		app.State.do_action(
			new app.Actions.Update_layer_action(config.layer.id, {
				x: config.layer.x + min_x,
				y: config.layer.y + min_y,
				width: max_x - min_x + dot_size,
				height: max_y - min_y + dot_size,
				data
			}),
			{
				merge_with_history: ['new_spray_layer', 'update_spray_layer']
			}
		);
	}

}

export default Spray_class;
