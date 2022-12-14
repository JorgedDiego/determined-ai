.. _topic-guides_hp-tuning-det_pbt:

##################################
 Population-based Training Method
##################################

Population-based training (PBT) is loosely based on genetic algorithms; see the original `paper
<https://arxiv.org/abs/1711.09846>`__ or `blog post
<https://deepmind.com/blog/population-based-training-neural-networks/>`__ for details. The
motivation is that it makes sense to explore hyperparameter configurations that are known to perform
well, because the performance of a model as a function of the hyperparameters is likely to show some
continuity. The algorithm works by repeatedly replacing low-performing hyperparameter configurations
with modified versions of high-performing ones.

************
 Quickstart
************

A typical set of configuration values for PBT:

-  ``population_size``: 40

-  ``num_rounds``, ``length_per_round``: The product of these values is the total training length
   for a trial that survives to the end of the experiment; it should be chosen similarly to the
   value of ``max_length`` for :ref:`topic-guides_hp-tuning-det_adaptive-asha`. For a given value of
   the product, decreasing ``length_per_round`` creates more opportunity for evaluation and
   selection of good configurations at the cost of higher variance and computational overhead.

-  ``replace_function``:

   -  ``truncate_fraction``: 0.2

-  ``explore_function``:

   -  ``resample_probability``: 0.2
   -  ``perturb_factor``: 0.2

*********
 Details
*********

At any time, the searcher maintains a fixed number of active trials (the *population*). Initially,
each trial uses a randomly chosen hyperparameter configuration, just as with the ``random``
searcher. The difference is that, periodically, every trial stops training and evaluates the
validation metric for the trial's current state; some of the worst-performing trials are closed,
while an equal number of the best-performing trials are *cloned* to replace them. Cloning a trial
involves checkpointing it and creating a new trial that continues training from that checkpoint. The
hyperparameters of the new trial are not generally equal to those of the original trial, but are
derived from them in a particular way; see :ref:`the description of available parameters
<hp-pbt-parameters>` for details.

There is an important constraint on the hyperparameters that are allowed to vary when PBT is in use:
it must always be possible to load a checkpoint from a model that was created with any potential
hyperparameter configuration into a model using any other configuration; otherwise, the cloning
process could fail. This means that, for instance, the number of hidden units in a neural network
layer cannot be such a hyperparameter. If it were, the models for different configurations could
have weight matrices of different dimensions, so their checkpoints would not be compatible.

.. _hp-pbt-parameters:

************
 Parameters
************

One *round* consists of a period of training followed by a validate/close/clone phase. During each
round, each running trial does a fixed amount of training, determined by the experiment
configuration.

-  ``population_size``: The number of trials that should run at the same time.

-  ``num_rounds``: The total number of rounds to run.

-  ``length_per_round``: The training units to train each trial for during a
      round, in terms of records, batches or epochs (see :ref:`Training Units
      <experiment-configuration_training_units>`).

The parameters for the cloning process are also configurable using two nested objects, called
``replace_function`` and ``explore_function``, within the searcher fields of the experiment
configuration file.

-  ``replace_function``: The configuration for deciding which trials to close.

   -  ``truncate_fraction``: The fraction of the population that is closed and replaced by clones at
      the end of each round.

-  ``explore_function``: The configuration for modifying hyperparameter configurations when cloning.
   Each hyperparameter is either *resampled*, meaning that it is replaced by a value drawn
   independently from the original configuration, or *perturbed*, meaning that it is multiplied by a
   configurable factor.

   -  ``resample_probability``: The probability that a hyperparameter is replaced with a new value
      sampled from the original distribution specified in the configuration.

   -  ``perturb_factor``: The amount by which hyperparameters that are not resampled are perturbed:
      each numerical hyperparameter is multiplied by either ``1 + perturb_factor`` or ``1 -
      perturb_factor`` with equal probability; ``categorical`` and ``const`` hyperparameters are
      left unchanged.
